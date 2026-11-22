// Cloudflare Realtime SFU istemcisi (ses arka ucu "cf").
// Cloudflare'de oda yok: her kişi iki bağlantı açar (yayın + dinleme). Kimin odada olduğu ve
// hangi izleri yayınladığı `voice_sessions` tablosundan (0023) okunur; Cloudflare çağrılarını
// `cf-voice` Edge Function yapar (gizli anahtar orada).
// Mikrofon, kamera, ekran paylaşımı ve yayın sesi. İz adları: mic, cam-xxxx, screen-xxxx,
// screen-audio-xxxx (her yayın yeni ad alır; dinleyenler eski izle karıştırmaz).
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { createRnnoiseTrack } from './rnnoise'

export interface CfMicSettings {
  micId: string
  speakerId: string
  noiseSuppression: boolean
  echoCancellation: boolean
  aiNoise: boolean
}

/** Bir <video> öğesine bağlanabilen görüntü kaynağı (LiveKit Track ile aynı biçim) */
export interface VideoSource {
  attach: (el: HTMLMediaElement) => unknown
  detach: (el: HTMLMediaElement) => unknown
}

export interface CfPeer {
  id: string
  hasMic: boolean
  speaking: boolean
  camera?: VideoSource
  screen?: VideoSource
  screenAudio: boolean
}

export interface CfScreenOptions {
  surface: 'monitor' | 'window' | 'browser'
  audio: boolean
  width: number
  height: number
  fps: number
  maxBitrate: number
  motion: boolean
}

type Kind = 'mic' | 'cam' | 'screen' | 'screen-audio'
const kindOf = (name: string): Kind | null =>
  name === 'mic' ? 'mic' : name.startsWith('screen-audio') ? 'screen-audio' : name.startsWith('screen') ? 'screen' : name.startsWith('cam') ? 'cam' : null
const freshName = (kind: Kind) => `${kind}-${Math.random().toString(36).slice(2, 8)}`

function videoSource(track: MediaStreamTrack): VideoSource {
  const stream = new MediaStream([track])
  return {
    attach: (el) => {
      el.srcObject = stream
      el.play().catch(() => {})
    },
    detach: (el) => {
      if (el.srcObject === stream) el.srcObject = null
    },
  }
}

interface LocalPub {
  name: string
  track: MediaStreamTrack
  transceiver: RTCRtpTransceiver
}

interface SessionRow {
  user_id: string
  channel_id: string
  pub_session: string
  tracks: string[]
}

interface RemoteAudio {
  key: string
  userId: string
  kind: Kind
  mid: string
  attached?: boolean
  video?: VideoSource
  el?: HTMLAudioElement
  source?: MediaStreamAudioSourceNode
  gain?: GainNode
  analyser?: AnalyserNode
}

const BEAT_MS = 30_000
const SPEAK_THRESHOLD = 0.012
const SPEAK_HOLD_MS = 350
const MAX_PULL_TRIES = 12

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('cf-voice', { body })
  if (error || !data || data.error) {
    let msg = data?.error ?? error?.message ?? 'Ses sunucusuna bağlanılamadı'
    const ctx = (error as { context?: Response } | null)?.context
    if (ctx && typeof ctx.json === 'function') {
      try {
        msg = (await ctx.json()).error ?? msg
      } catch {
        // yoksay
      }
    }
    throw new Error(msg)
  }
  return data
}

/** setLocalDescription sonrası adaylar toplanana kadar (en çok 2 sn) bekler */
function gathered(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      window.clearTimeout(timer)
      resolve()
    }
    const check = () => pc.iceGatheringState === 'complete' && done()
    const timer = window.setTimeout(done, 2000)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

function level(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

export class CfRoom {
  /** Katılımcı / konuşan / mikrofon durumu değişti */
  onChange: () => void = () => {}
  onPeerJoin: () => void = () => {}
  onPeerLeave: () => void = () => {}
  /** Bağlantı koptu (oda dışına düşüldü) */
  onDisconnected: (message: string) => void = () => {}
  onError: (message: string) => void = () => {}

  channelId: string | null = null
  micOn = false
  localSpeaking = false

  private userId = ''
  private gen = 0 // her bağlantı denemesinin kimliği: eski yanıtlar yeni bağlantıyı bozmasın
  private pubSession = ''
  private pubPc: RTCPeerConnection | null = null
  private subPc: RTCPeerConnection | null = null
  private micSender: RTCRtpSender | null = null
  private rawMic: MediaStreamTrack | null = null
  private sentMic: MediaStreamTrack | null = null
  private destroyNoise: (() => void) | null = null
  private micWanted = false
  private settings: CfMicSettings = { micId: 'default', speakerId: 'default', noiseSuppression: true, echoCancellation: true, aiNoise: true }
  private volumes: Record<string, number> = {}
  private streamVolumes: Record<string, number> = {}
  private deaf = false
  /** Ekran paylaşımı dışarıdan bitti (tarayıcının "Paylaşmayı durdur" düğmesi) */
  onScreenEnded: () => void = () => {}
  private cam: LocalPub | null = null
  private screen: LocalPub | null = null
  private screenAud: LocalPub | null = null
  private cameraId = ''
  localCamera?: VideoSource
  localScreen?: VideoSource

  private rows = new Map<string, SessionRow>()
  private remotes = new Map<string, RemoteAudio>() // anahtar: kullanıcı:iz:oturum
  private byMid = new Map<string, RemoteAudio>()
  private tries = new Map<string, number>()
  private queue: Promise<void> = Promise.resolve() // dinleme oturumundaki işlemler sırayla
  private pubQueue: Promise<void> = Promise.resolve()
  private live: RealtimeChannel | null = null
  private beatTimer = 0
  private speakTimer = 0
  private retryTimer = 0
  private ctx: AudioContext | null = null
  private localAnalyser: AnalyserNode | null = null
  private localSource: MediaStreamAudioSourceNode | null = null
  private speakingAt = new Map<string, number>()
  private speaking = new Set<string>()

  get connected() {
    return this.channelId !== null
  }

  peers(): CfPeer[] {
    return [...this.rows.values()]
      .filter((r) => r.user_id !== this.userId)
      .map((r) => {
        const mine = [...this.remotes.values()].filter((x) => x.userId === r.user_id)
        return {
          id: r.user_id,
          hasMic: r.tracks.includes('mic'),
          speaking: this.speaking.has(r.user_id),
          camera: mine.find((x) => x.kind === 'cam')?.video,
          screen: mine.find((x) => x.kind === 'screen')?.video,
          screenAudio: mine.some((x) => x.kind === 'screen-audio' && x.attached),
        }
      })
  }

  get cameraOn() {
    return !!this.cam
  }

  get screenOn() {
    return !!this.screen
  }

  /**
   * Odaya gir. Önce izin alınır (oda doluysa / izin yoksa hata fırlar ve mevcut görüşme kopmaz);
   * izin gelince `beforeSwitch` çağrılır (eski bağlantıyı kapatmak için).
   */
  async connect(
    channelId: string,
    userId: string,
    opts: { settings: CfMicSettings; micOn: boolean; deafened: boolean; volumes: Record<string, number>; streamVolumes: Record<string, number> },
    beforeSwitch?: () => Promise<void> | void,
  ) {
    const joined = await call<{ pubSession: string; iceServers: RTCIceServer[] }>({ action: 'join', channelId })
    await beforeSwitch?.()
    this.teardown() // aynı arka uçta oda değişimi: satır zaten yeni odaya taşındı, silme
    const gen = ++this.gen
    this.userId = userId
    this.channelId = channelId
    this.pubSession = joined.pubSession
    this.settings = opts.settings
    this.volumes = opts.volumes
    this.streamVolumes = opts.streamVolumes
    this.deaf = opts.deafened

    const cfg: RTCConfiguration = { iceServers: joined.iceServers, bundlePolicy: 'max-bundle' }
    const pubPc = (this.pubPc = new RTCPeerConnection(cfg))
    const subPc = (this.subPc = new RTCPeerConnection(cfg))
    const watch = (pc: RTCPeerConnection) =>
      pc.addEventListener('connectionstatechange', () => {
        if (gen !== this.gen || pc.connectionState !== 'failed') return
        this.teardown()
        this.onDisconnected('Ses bağlantısı koptu. Odaya yeniden gir.')
      })
    watch(pubPc)
    watch(subPc)
    subPc.addEventListener('track', (e) => {
      const mid = e.transceiver.mid
      const r = mid ? this.byMid.get(mid) : undefined
      if (r) this.attach(r, e.track)
    })

    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.ctx.resume().catch(() => {})
    this.applySpeaker()

    this.live = supabase
      .channel(`voice-sessions-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_sessions' }, (p) => {
        if (gen !== this.gen) return
        if (p.eventType === 'DELETE') this.dropRow((p.old as { user_id?: string }).user_id)
        else {
          const row = p.new as SessionRow
          if (row.channel_id === channelId) this.putRow(row)
          else this.dropRow(row.user_id) // başka odaya geçti
        }
        this.reconcile()
      })
      .subscribe()

    this.beatTimer = window.setInterval(() => this.beat(gen), BEAT_MS)
    this.speakTimer = window.setInterval(() => this.detectSpeaking(), 100)
    await this.beat(gen, true)
    if (gen !== this.gen) return
    await this.setMic(opts.micOn)
  }

  /** Odadan çık */
  disconnect() {
    if (!this.connected) return
    const pub = this.pubSession
    this.teardown()
    supabase.rpc('voice_leave', { pub }).then(() => {})
  }

  private teardown() {
    this.gen++
    window.clearInterval(this.beatTimer)
    window.clearInterval(this.speakTimer)
    window.clearTimeout(this.retryTimer)
    if (this.live) supabase.removeChannel(this.live)
    this.live = null
    for (const r of this.remotes.values()) this.detach(r)
    this.remotes.clear()
    this.byMid.clear()
    this.tries.clear()
    this.rows.clear()
    this.speaking.clear()
    this.speakingAt.clear()
    this.stopMic()
    this.micSender = null
    for (const p of [this.cam, this.screen, this.screenAud]) p?.track.stop()
    this.cam = this.screen = this.screenAud = null
    this.localCamera = this.localScreen = undefined
    this.pubPc?.close()
    this.subPc?.close()
    this.pubPc = this.subPc = null
    this.ctx?.close().catch(() => {})
    this.ctx = null
    this.queue = Promise.resolve()
    this.pubQueue = Promise.resolve()
    this.channelId = null
    this.pubSession = ''
    this.micOn = false
    this.localSpeaking = false
  }

  // ───────── Oda durumu ─────────

  private putRow(row: SessionRow) {
    const had = this.rows.has(row.user_id)
    this.rows.set(row.user_id, { user_id: row.user_id, channel_id: row.channel_id, pub_session: row.pub_session, tracks: row.tracks ?? [] })
    if (!had && row.user_id !== this.userId) this.onPeerJoin()
    if (!had) this.onChange()
  }

  private dropRow(userId?: string) {
    if (!userId || !this.rows.delete(userId)) return
    if (userId === this.userId) {
      // Satırımız silindi (başka cihazdan girildi ya da sunucu temizledi)
      if (this.connected) {
        this.teardown()
        this.onDisconnected('Ses oturumu başka bir yerden açıldı ya da kapandı.')
      }
      return
    }
    this.onPeerLeave()
    this.onChange()
  }

  /** Yaşam sinyali + odadaki taze satırlar (sunucu saatiyle; 90 sn sessiz kalan düşer) */
  private async beat(gen: number, first = false) {
    const { data, error } = await supabase.rpc('voice_beat')
    if (gen !== this.gen || error || !data) return
    const rows = data as SessionRow[]
    const seen = new Set(rows.map((r) => r.user_id))
    if (!seen.has(this.userId)) {
      this.dropRow(this.userId)
      if (this.connected) {
        this.teardown()
        this.onDisconnected('Ses oturumu kapandı. Odaya yeniden gir.')
      }
      return
    }
    for (const r of rows) {
      if (first) this.rows.set(r.user_id, r)
      else this.putRow(r)
    }
    for (const id of [...this.rows.keys()]) if (!seen.has(id)) this.dropRow(id)
    this.tries.clear()
    this.reconcile()
    if (first) this.onChange()
  }

  // ───────── Dinleme ─────────

  private wanted() {
    const want = new Map<string, { userId: string; name: string }>()
    for (const r of this.rows.values()) {
      if (r.user_id === this.userId) continue
      for (const name of r.tracks) if (kindOf(name)) want.set(`${r.user_id}:${name}:${r.pub_session}`, { userId: r.user_id, name })
    }
    return want
  }

  private reconcile() {
    const gen = this.gen
    this.queue = this.queue.then(() => this.reconcileNow(gen)).catch((e) => console.warn('cf-voice dinleme:', e))
  }

  private async reconcileNow(gen: number) {
    if (gen !== this.gen || !this.subPc) return
    const want = this.wanted()

    // Artık istenmeyenleri kapat
    const gone = [...this.remotes.values()].filter((r) => !want.has(r.key))
    if (gone.length) {
      for (const r of gone) {
        this.detach(r)
        this.remotes.delete(r.key)
        this.byMid.delete(r.mid)
      }
      this.onChange()
      await call({ action: 'close', mids: gone.map((r) => r.mid) }).catch(() => {})
      if (gen !== this.gen) return
    }

    const missing = [...want.entries()].filter(([key]) => !this.remotes.has(key) && (this.tries.get(key) ?? 0) < MAX_PULL_TRIES)
    if (!missing.length) return
    const res = await call<{ sdp: string | null; tracks: { userId: string; name: string; mid?: string; error?: string }[] }>({
      action: 'pull',
      tracks: missing.map(([, t]) => t),
    })
    if (gen !== this.gen || !this.subPc) return
    let failed = false
    for (const [key, t] of missing) {
      const hit = res.tracks.find((x) => x.userId === t.userId && x.name === t.name)
      if (hit?.mid) {
        const r: RemoteAudio = { key, userId: t.userId, kind: kindOf(t.name)!, mid: hit.mid }
        this.remotes.set(key, r)
        this.byMid.set(hit.mid, r)
      } else {
        // Yayın henüz paket göndermiyor olabilir: biraz sonra yeniden dene
        failed = true
        this.tries.set(key, (this.tries.get(key) ?? 0) + 1)
      }
    }
    if (res.sdp) {
      await this.subPc.setRemoteDescription({ type: 'offer', sdp: res.sdp })
      await this.subPc.setLocalDescription(await this.subPc.createAnswer())
      await gathered(this.subPc)
      if (gen !== this.gen || !this.subPc.localDescription) return
      await call({ action: 'answer', sdp: this.subPc.localDescription.sdp })
      if (gen !== this.gen || !this.subPc) return
    }
    // "track" olayı gelmediyse (SFU eski bir alıcıyı yeniden kullandıysa) izi alıcıdan al
    for (const r of this.remotes.values()) {
      if (r.attached) continue
      const tr = this.subPc.getTransceivers().find((x) => x.mid === r.mid)
      if (tr?.receiver.track) this.attach(r, tr.receiver.track)
    }
    if (failed) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = window.setTimeout(() => gen === this.gen && this.reconcile(), 1500)
    }
  }

  private attach(r: RemoteAudio, track: MediaStreamTrack) {
    if (!this.ctx || r.attached) return
    r.attached = true
    if (r.kind === 'cam' || r.kind === 'screen') {
      r.video = videoSource(track)
      this.onChange()
      return
    }
    const stream = new MediaStream([track])
    // Chrome: uzak WebRTC sesi bir <audio> öğesine bağlı değilse Web Audio'ya akmaz.
    // Öğe sessiz; duyulan ses kazanç düğümünden geçer (kişi başı %200'e kadar).
    const el = new Audio()
    el.muted = true
    el.srcObject = stream
    el.play().catch(() => {})
    r.el = el
    r.source = this.ctx.createMediaStreamSource(stream)
    r.gain = this.ctx.createGain()
    if (r.kind === 'mic') {
      r.analyser = this.ctx.createAnalyser()
      r.analyser.fftSize = 512
      r.source.connect(r.analyser)
    }
    r.source.connect(r.gain)
    r.gain.connect(this.ctx.destination)
    this.applyGain(r)
    this.ctx.resume().catch(() => {})
    if (r.kind === 'screen-audio') this.onChange()
  }

  private detach(r: RemoteAudio) {
    try {
      r.source?.disconnect()
      r.gain?.disconnect()
    } catch {
      // yoksay
    }
    if (r.el) {
      r.el.pause()
      r.el.srcObject = null
    }
    r.el = r.source = r.gain = r.analyser = r.video = undefined
    if (r.kind === 'mic') this.speaking.delete(r.userId)
  }

  private applyGain(r: RemoteAudio) {
    const v = r.kind === 'screen-audio' ? this.streamVolumes[r.userId] : this.volumes[r.userId]
    if (r.gain) r.gain.gain.value = this.deaf ? 0 : v ?? 1
  }

  setStreamVolumes(volumes: Record<string, number>) {
    this.streamVolumes = volumes
    this.remotes.forEach((r) => this.applyGain(r))
  }

  setVolumes(volumes: Record<string, number>) {
    this.volumes = volumes
    this.remotes.forEach((r) => this.applyGain(r))
  }

  setDeafened(deaf: boolean) {
    this.deaf = deaf
    this.remotes.forEach((r) => this.applyGain(r))
  }

  private applySpeaker() {
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null
    if (!ctx?.setSinkId) return
    ctx.setSinkId(this.settings.speakerId === 'default' ? '' : this.settings.speakerId).catch(() => {})
  }

  // ───────── Mikrofon ─────────

  /** Mikrofonu aç/kapat. İlk açılışta izin istenir ve iz yayınlanır; sonrası yalnız sessize alma. */
  setMic(on: boolean) {
    this.micWanted = on
    const gen = this.gen
    this.pubQueue = this.pubQueue
      .then(async () => {
        if (gen !== this.gen || !this.pubPc) return
        if (on && !this.sentMic) await this.startMic(gen)
        if (gen !== this.gen) return
        if (this.sentMic) this.sentMic.enabled = this.micWanted
        this.micOn = !!this.sentMic && this.micWanted
        if (!this.micOn) this.localSpeaking = false
        this.onChange()
      })
      .catch((e) => {
        if (gen === this.gen) this.onError(`Mikrofon açılamadı: ${(e as Error).message}`)
      })
    return this.pubQueue
  }

  /** Ayar değişti (cihaz, gürültü engelleme, hoparlör) */
  updateSettings(next: CfMicSettings) {
    const prev = this.settings
    this.settings = next
    if (next.speakerId !== prev.speakerId) this.applySpeaker()
    const micChanged =
      next.micId !== prev.micId ||
      next.noiseSuppression !== prev.noiseSuppression ||
      next.echoCancellation !== prev.echoCancellation ||
      next.aiNoise !== prev.aiNoise
    if (!micChanged || !this.sentMic) return
    const gen = this.gen
    this.pubQueue = this.pubQueue
      .then(async () => {
        if (gen !== this.gen) return
        const fresh = await this.capture()
        if (gen !== this.gen) {
          fresh.raw.stop()
          fresh.destroy?.()
          return
        }
        await this.micSender?.replaceTrack(fresh.sent)
        this.stopMic()
        this.useMic(fresh)
        fresh.sent.enabled = this.micWanted
      })
      .catch((e) => {
        if (gen === this.gen) this.onError(`Mikrofon değiştirilemedi: ${(e as Error).message}`)
      })
  }

  private async capture() {
    const s = this.settings
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: s.micId && s.micId !== 'default' ? { exact: s.micId } : undefined,
        noiseSuppression: s.noiseSuppression,
        echoCancellation: s.echoCancellation,
        autoGainControl: true,
        channelCount: 1,
      },
    })
    const raw = stream.getAudioTracks()[0]
    let sent = raw
    let destroy: (() => void) | null = null
    if (s.aiNoise) {
      try {
        const n = await createRnnoiseTrack(raw)
        sent = n.track
        destroy = n.destroy
      } catch (e) {
        console.warn('RNNoise kullanılamadı, normal mikrofon izi kullanılıyor:', e)
      }
    }
    return { raw, sent, destroy }
  }

  private useMic(m: { raw: MediaStreamTrack; sent: MediaStreamTrack; destroy: (() => void) | null }) {
    this.rawMic = m.raw
    this.sentMic = m.sent
    this.destroyNoise = m.destroy
    if (this.ctx) {
      this.localSource = this.ctx.createMediaStreamSource(new MediaStream([m.sent]))
      this.localAnalyser = this.ctx.createAnalyser()
      this.localAnalyser.fftSize = 512
      this.localSource.connect(this.localAnalyser)
    }
  }

  private stopMic() {
    try {
      this.localSource?.disconnect()
    } catch {
      // yoksay
    }
    this.localSource = this.localAnalyser = null
    this.destroyNoise?.()
    this.destroyNoise = null
    this.rawMic?.stop()
    if (this.sentMic !== this.rawMic) this.sentMic?.stop()
    this.rawMic = this.sentMic = null
  }

  private async startMic(gen: number) {
    const pc = this.pubPc
    if (!pc) return
    const m = await this.capture()
    if (gen !== this.gen) {
      m.raw.stop()
      m.destroy?.()
      return
    }
    this.useMic(m)
    m.sent.enabled = this.micWanted
    const tr = pc.addTransceiver(m.sent, { direction: 'sendonly' })
    this.micSender = tr.sender
    try {
      await pc.setLocalDescription(await pc.createOffer())
      await gathered(pc)
      if (gen !== this.gen || !pc.localDescription || !tr.mid) return
      const res = await call<{ sdp: string | null; tracks: { name: string; error?: string }[] }>({
        action: 'publish',
        sdp: pc.localDescription.sdp,
        tracks: [{ mid: tr.mid, name: 'mic' }],
      })
      if (gen !== this.gen) return
      if (!res.sdp) throw new Error(res.tracks[0]?.error ?? 'yayın başlatılamadı')
      await pc.setRemoteDescription({ type: 'answer', sdp: res.sdp })
      if (res.tracks[0]?.error) throw new Error(res.tracks[0].error)
    } catch (e) {
      // Yayın kurulamadı: mikrofonu bırak ki bir sonraki açma denemesi baştan başlasın
      if (gen === this.gen) {
        this.stopMic()
        this.micSender = null
        try {
          tr.stop()
        } catch {
          // yoksay
        }
      }
      throw e
    }
  }

  // ───────── Kamera ve ekran ─────────

  /** Yayın oturumuna iz ekler (istemci offer → Cloudflare answer). pubQueue içinde çağrılır. */
  private async publish(items: { kind: Kind; track: MediaStreamTrack; encoding?: RTCRtpEncodingParameters }[], gen: number): Promise<LocalPub[]> {
    const pc = this.pubPc
    if (!pc) throw new Error('bağlantı yok')
    const pubs: LocalPub[] = items.map((it) => ({
      name: freshName(it.kind),
      track: it.track,
      transceiver: pc.addTransceiver(it.track, { direction: 'sendonly', sendEncodings: it.encoding ? [it.encoding] : undefined }),
    }))
    try {
      await pc.setLocalDescription(await pc.createOffer())
      await gathered(pc)
      if (gen !== this.gen || !pc.localDescription) throw new Error('bağlantı kapandı')
      const res = await call<{ sdp: string | null; tracks: { name: string; error?: string }[] }>({
        action: 'publish',
        sdp: pc.localDescription.sdp,
        tracks: pubs.map((p) => ({ mid: p.transceiver.mid, name: p.name })),
      })
      if (gen !== this.gen) throw new Error('bağlantı kapandı')
      if (!res.sdp) throw new Error(res.tracks.find((t) => t.error)?.error ?? 'yayın başlatılamadı')
      await pc.setRemoteDescription({ type: 'answer', sdp: res.sdp })
      const bad = res.tracks.find((t) => t.error)
      if (bad) throw new Error(bad.error)
      return pubs
    } catch (e) {
      for (const p of pubs) {
        p.track.stop()
        try {
          p.transceiver.stop()
        } catch {
          // yoksay
        }
      }
      throw e
    }
  }

  /** Yayını bitirir: alıcı-vericiyi durdurur, Cloudflare ile pazarlığı tamamlar. pubQueue içinde çağrılır. */
  private async unpublish(pubs: LocalPub[], gen: number) {
    const pc = this.pubPc
    if (!pubs.length) return
    const tracks = pubs.map((p) => ({ mid: p.transceiver.mid, name: p.name }))
    for (const p of pubs) {
      p.track.stop()
      try {
        p.transceiver.stop()
      } catch {
        // yoksay
      }
    }
    if (!pc || gen !== this.gen) return
    try {
      await pc.setLocalDescription(await pc.createOffer())
      await gathered(pc)
      if (gen !== this.gen || !pc.localDescription) return
      const res = await call<{ sdp: string | null }>({ action: 'unpublish', tracks, sdp: pc.localDescription.sdp })
      if (gen !== this.gen) return
      if (res.sdp) await pc.setRemoteDescription({ type: 'answer', sdp: res.sdp })
    } catch (e) {
      console.warn('cf-voice yayın kapatma:', e)
      if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' }).catch(() => {})
    }
  }

  private enqueue(job: (gen: number) => Promise<void>, label: string) {
    const gen = this.gen
    this.pubQueue = this.pubQueue
      .then(() => (gen === this.gen && this.pubPc ? job(gen) : undefined))
      .catch((e) => {
        if (gen === this.gen) this.onError(`${label}: ${(e as Error).message}`)
      })
      .then(() => this.onChange())
    return this.pubQueue
  }

  setCamera(on: boolean, deviceId?: string) {
    if (deviceId !== undefined) this.cameraId = deviceId
    return this.enqueue(async (gen) => {
      if (on === !!this.cam) return
      if (!on) {
        const old = this.cam!
        this.cam = null
        this.localCamera = undefined
        this.onChange()
        await this.unpublish([old], gen)
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: this.cameraId ? { exact: this.cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      })
      const track = stream.getVideoTracks()[0]
      if (gen !== this.gen) return track.stop()
      const [pub] = await this.publish([{ kind: 'cam', track, encoding: { maxBitrate: 1_500_000, maxFramerate: 30 } }], gen)
      this.cam = pub
      this.localCamera = videoSource(track)
    }, 'Kamera açılamadı')
  }

  /** Kamera cihazı değişti: açıksa yeni cihazla yeniden başlat */
  switchCamera(deviceId: string) {
    this.cameraId = deviceId
    if (!this.cam) return
    this.enqueue(async (gen) => {
      if (!this.cam) return
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      const track = stream.getVideoTracks()[0]
      if (gen !== this.gen || !this.cam) return track.stop()
      await this.cam.transceiver.sender.replaceTrack(track)
      this.cam.track.stop()
      this.cam.track = track
      this.localCamera = videoSource(track)
    }, 'Kamera değiştirilemedi')
  }

  startScreen(o: CfScreenOptions) {
    return this.enqueue(async (gen) => {
      if (this.screen) return
      // Yankı önleme: sistem sesi yakalanırken CSN'nin kendi çaldığı ses yakalamaya girmesin
      const audio = o.audio
        ? ({ restrictOwnAudio: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints)
        : false
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: o.surface, width: { ideal: o.width }, height: { ideal: o.height }, frameRate: { ideal: o.fps } },
        audio,
        systemAudio: o.audio ? 'include' : 'exclude',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        preferCurrentTab: false,
      } as DisplayMediaStreamOptions)
      const video = stream.getVideoTracks()[0]
      const sound = stream.getAudioTracks()[0] as MediaStreamTrack | undefined
      if (gen !== this.gen) return stream.getTracks().forEach((t) => t.stop())
      video.contentHint = o.motion ? 'motion' : 'detail'
      if (sound) sound.contentHint = 'music'
      const items: Parameters<CfRoom['publish']>[0] = [{ kind: 'screen', track: video, encoding: { maxBitrate: o.maxBitrate, maxFramerate: o.fps } }]
      if (sound) items.push({ kind: 'screen-audio', track: sound, encoding: { maxBitrate: 128_000 } })
      const pubs = await this.publish(items, gen)
      this.screen = pubs[0]
      this.screenAud = pubs[1] ?? null
      this.localScreen = videoSource(video)
      video.addEventListener('ended', () => {
        if (this.screen?.track !== video) return
        this.stopScreen()
        this.onScreenEnded()
      })
    }, 'Ekran paylaşılamadı')
  }

  stopScreen() {
    return this.enqueue(async (gen) => {
      const pubs = [this.screen, this.screenAud].filter((p): p is LocalPub => !!p)
      this.screen = this.screenAud = null
      this.localScreen = undefined
      this.onChange()
      await this.unpublish(pubs, gen)
    }, 'Ekran paylaşımı kapatılamadı')
  }

  // ───────── Konuşan göstergesi ─────────

  private buf = new Float32Array(new ArrayBuffer(512 * 4))

  private detectSpeaking() {
    const now = performance.now()
    let changed = false
    const mark = (id: string, analyser: AnalyserNode | null | undefined, active: boolean) => {
      if (analyser && active && level(analyser, this.buf) > SPEAK_THRESHOLD) this.speakingAt.set(id, now)
      const is = now - (this.speakingAt.get(id) ?? -Infinity) < SPEAK_HOLD_MS && active
      if (is !== this.speaking.has(id)) {
        if (is) this.speaking.add(id)
        else this.speaking.delete(id)
        changed = true
      }
    }
    for (const r of this.remotes.values()) if (r.kind === 'mic') mark(r.userId, r.analyser, true)
    mark(this.userId, this.localAnalyser, this.micOn)
    this.localSpeaking = this.speaking.has(this.userId)
    if (changed) this.onChange()
  }
}
