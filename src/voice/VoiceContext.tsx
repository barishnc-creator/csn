import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import {
  ConnectionErrorReason,
  ConnectionState,
  LocalParticipant,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPreset,
  VideoPresets,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type RemoteTrack,
  type TrackPublication,
} from 'livekit-client'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { playSound } from './sounds'
import { RnnoiseProcessor } from './rnnoise'
import ScreenSharePicker, { type ShareChoice, type ShareQuality } from './ScreenSharePicker'
import { getDesktop } from '../lib/desktop'
import { CfRoom, type VideoSource } from './cfVoice'

// Cloudflare arka ucunda ekran paylaşımı kalite profilleri
const CF_SHARE: Record<ShareQuality, { width: number; height: number; fps: number; maxBitrate: number }> = {
  smooth: { width: 1280, height: 720, fps: 30, maxBitrate: 2_500_000 },
  clear: { width: 1920, height: 1080, fps: 30, maxBitrate: 4_000_000 },
  game: { width: 1920, height: 1080, fps: 60, maxBitrate: 8_000_000 },
}

// Ekran paylaşımı kalite profilleri (LiveKit'te hazır 1080p60 profili yok, elle tanımlı)
const SHARE_PRESETS: Record<ShareQuality, VideoPreset> = {
  smooth: ScreenSharePresets.h720fps30,
  clear: ScreenSharePresets.h1080fps30,
  game: new VideoPreset(1920, 1080, 8_000_000, 60, 'high'),
}

export type InputMode = 'vad' | 'ptt'

export interface VoiceSettings {
  inputMode: InputMode
  pttKey: string // KeyboardEvent.code
  micId: string
  speakerId: string
  cameraId: string
  noiseSuppression: boolean
  echoCancellation: boolean
  aiNoise: boolean // RNNoise ile gelişmiş gürültü engelleme
  volumes: Record<string, number> // kullanıcı id → 0..2
  streamVolumes: Record<string, number> // kullanıcı id → yayın (ekran) sesi 0..2
}

export interface VoiceParticipant {
  id: string
  name: string
  isLocal: boolean
  speaking: boolean
  micMuted: boolean
  camera?: VideoSource
  screen?: VideoSource
  screenAudio: boolean // yayının sesi var mı
}

interface VoiceState {
  channelId: string | null
  connecting: boolean
  error: string | null
  participants: VoiceParticipant[]
  muted: boolean
  deafened: boolean
  cameraOn: boolean
  screenOn: boolean
  pttActive: boolean
  settings: VoiceSettings
  join: (channelId: string) => Promise<void>
  leave: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  toggleCamera: () => Promise<void>
  toggleScreen: () => Promise<void>
  setVolume: (userId: string, v: number) => void
  setStreamVolume: (userId: string, v: number) => void
  updateSettings: (patch: Partial<VoiceSettings>) => void
  /** Görüntü sahnesi ekranda mı? (kimse izlemiyorken görüntü indirilmez: kota) */
  setWatching: (on: boolean) => void
  clearError: () => void
}

const Ctx = createContext<VoiceState | null>(null)
export function useVoice() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useVoice, VoiceProvider dışında kullanıldı')
  return v
}

const SETTINGS_KEY = 'csn.voice'
const defaults: VoiceSettings = {
  inputMode: 'vad',
  pttKey: 'Backquote',
  micId: 'default',
  speakerId: 'default',
  cameraId: '',
  noiseSuppression: true,
  echoCancellation: true,
  aiNoise: true,
  volumes: {},
  streamVolumes: {},
}

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { updatePresence, profiles, presence, userId: myId } = useApp()
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: true,
        webAudioMix: true, // kişi başı ses %100 üstüne çıkabilsin
        dynacast: true,
        publishDefaults: {
          dtx: true,
          red: true,
          screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
          videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        },
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
      }),
  )
  const [channelId, setChannelId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [pttActive, setPttActive] = useState(false)
  const [settings, setSettings] = useState<VoiceSettings>(loadSettings)
  const [version, bump] = useReducer((x: number) => x + 1, 0)
  // İkinci arka uç: Cloudflare Realtime (server_state.voice_mode = 'cf'). LiveKit yolu aynen durur.
  const [cf] = useState(() => new CfRoom())
  const cfOn = useRef(false) // şu anki görüşme Cloudflare üzerinden mi

  const shareAttempt = useRef(false)
  const audioHost = useRef<HTMLDivElement | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const deafRef = useRef(deafened)
  deafRef.current = deafened

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // yoksay
    }
  }, [settings])

  const applyVolume = useCallback((p: RemoteParticipant) => {
    const deaf = deafRef.current
    p.setVolume(deaf ? 0 : settingsRef.current.volumes[p.identity] ?? 1, Track.Source.Microphone)
    p.setVolume(deaf ? 0 : settingsRef.current.streamVolumes?.[p.identity] ?? 1, Track.Source.ScreenShareAudio)
  }, [])

  // Oda olayları → arayüzü yenile
  useEffect(() => {
    const onSub = (track: RemoteTrack, _pub: TrackPublication, p: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach()
        el.dataset.participant = p.identity
        audioHost.current?.appendChild(el)
        applyVolume(p)
      }
      bump()
    }
    const onUnsub = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove())
      bump()
    }
    const onJoin = () => {
      playSound('join')
      bump()
    }
    const onLeave = () => {
      playSound('leave')
      bump()
    }
    const onDisconnected = () => {
      setChannelId(null)
      bump()
    }
    room
      .on(RoomEvent.TrackSubscribed, onSub)
      .on(RoomEvent.TrackUnsubscribed, onUnsub)
      .on(RoomEvent.ParticipantConnected, onJoin)
      .on(RoomEvent.ParticipantDisconnected, onLeave)
      .on(RoomEvent.ActiveSpeakersChanged, bump)
      .on(RoomEvent.TrackMuted, bump)
      .on(RoomEvent.TrackUnmuted, bump)
      .on(RoomEvent.LocalTrackPublished, bump)
      .on(RoomEvent.LocalTrackUnpublished, bump)
      .on(RoomEvent.TrackPublished, bump)
      .on(RoomEvent.TrackUnpublished, bump)
      .on(RoomEvent.ConnectionStateChanged, bump)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.MediaDevicesError, (e: Error) => {
        // Ekran paylaşımı penceresinde "İptal" demek hata değildir
        if (shareAttempt.current && (e.name === 'NotAllowedError' || e.name === 'AbortError' || /denied/i.test(e.message))) return
        setError(`Cihaz hatası: ${e.message}`)
      })
    return () => {
      room.removeAllListeners()
      room.disconnect()
    }
  }, [room, applyVolume])

  // Cloudflare arka ucunun olayları
  useEffect(() => {
    cf.onChange = bump
    cf.onPeerJoin = () => playSound('join')
    cf.onPeerLeave = () => playSound('leave')
    cf.onError = (m) => {
      // Ekran paylaşımı penceresinde "İptal" demek hata değildir
      if (/Permission denied|NotAllowed|AbortError/i.test(m) && shareAttempt.current) return
      setError(m)
    }
    cf.onScreenEnded = () => updatePresence({ streaming: false })
    cf.onDisconnected = (m) => {
      cfOn.current = false
      setError(m)
      setChannelId(null)
      updatePresence({ voice_channel_id: null, streaming: false })
      bump()
    }
    return () => cf.disconnect()
  }, [cf, updatePresence])

  const micShouldBeOn = useCallback(
    (m: boolean, ptt: boolean) => !m && (settingsRef.current.inputMode === 'vad' || ptt),
    [],
  )

  // Gelişmiş gürültü engelleme (RNNoise): mikrofon izine işlemci tak / çıkar.
  // İz her yeniden oluşturulduğunda (katılma, ayar değişimi) syncMic sonrası tekrar çağrılır.
  // Hata olursa sessizce normal ize düşer; sesi asla bozmaz.
  const processorBusy = useRef<Promise<void>>(Promise.resolve())
  const applyNoiseProcessor = useCallback(() => {
    const run = async () => {
      if (room.state !== ConnectionState.Connected) return
      const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack
      if (!track) return
      const current = track.getProcessor()
      try {
        if (settingsRef.current.aiNoise) {
          if (!(current instanceof RnnoiseProcessor)) await track.setProcessor(new RnnoiseProcessor())
        } else if (current) {
          await track.stopProcessor()
        }
      } catch (e) {
        console.warn('RNNoise kullanılamadı, normal mikrofon izi kullanılıyor:', e)
        try {
          if (track.getProcessor()) await track.stopProcessor()
        } catch {
          // yoksay
        }
      }
    }
    // Aynı anda iki setProcessor çalışmasın diye sıraya al
    processorBusy.current = processorBusy.current.then(run, run)
    return processorBusy.current
  }, [room])

  const syncMic = useCallback(
    async (m: boolean, ptt: boolean) => {
      if (cfOn.current) {
        await cf.setMic(micShouldBeOn(m, ptt))
        return
      }
      if (room.state !== ConnectionState.Connected) return
      const s = settingsRef.current
      try {
        await room.localParticipant.setMicrophoneEnabled(micShouldBeOn(m, ptt), {
          deviceId: s.micId,
          noiseSuppression: s.noiseSuppression,
          echoCancellation: s.echoCancellation,
          autoGainControl: true,
        })
      } catch (e) {
        setError(`Mikrofon açılamadı: ${(e as Error).message}`)
      }
      await applyNoiseProcessor()
      bump()
    },
    [room, cf, micShouldBeOn, applyNoiseProcessor],
  )

  const leave = useCallback(() => {
    if (room.state !== ConnectionState.Disconnected || cf.connected) playSound('leave')
    room.disconnect()
    cf.disconnect()
    cfOn.current = false
    setChannelId(null)
    updatePresence({ voice_channel_id: null, streaming: false })
  }, [room, cf, updatePresence])

  const join = useCallback(
    async (id: string) => {
      if (id === channelId || connecting) return
      setError(null)
      setConnecting(true)
      let switched = false
      try {
        // Önce anahtar alınır: oda doluysa ya da izin yoksa mevcut görüşme kopmaz
        const getToken = async (cloudFailed: boolean) => {
          const { data, error } = await supabase.functions.invoke<{ token: string; url: string; server?: 'cloud' | 'self'; error?: string }>(
            'livekit-token',
            { body: { channelId: id, cloudFailed } },
          )
          if (error || !data?.token) {
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
        // Sahip ses sunucusu olarak Cloudflare'i seçtiyse (Ayarlar → Ses sunucusu) o arka uç kullanılır
        const { data: st } = await supabase.from('server_state').select('voice_mode').maybeSingle()
        if (st?.voice_mode === 'cf') {
          const s = settingsRef.current
          await cf.connect(
            id,
            myId,
            { settings: s, micOn: micShouldBeOn(muted, false), deafened, volumes: s.volumes, streamVolumes: s.streamVolumes ?? {} },
            async () => {
              switched = true
              if (room.state !== ConnectionState.Disconnected) await room.disconnect()
            },
          )
          cfOn.current = true
          setChannelId(id)
          playSound('join')
          updatePresence({ voice_channel_id: id, muted, deafened, streaming: false })
          return
        }
        const data = await getToken(false)
        switched = true
        if (cf.connected) cf.disconnect()
        cfOn.current = false
        if (room.state !== ConnectionState.Disconnected) await room.disconnect()
        try {
          await room.connect(data.url, data.token)
        } catch (e) {
          // LiveKit Cloud kotası dolmuş ya da Cloud'a ulaşılamıyor: yedek sunucu istenir (sunucu herkesi birlikte geçirir)
          if (data.server !== 'cloud' || (e as { reason?: unknown }).reason === ConnectionErrorReason.Cancelled) throw e
          const alt = await getToken(true)
          if (alt.server !== 'self') throw e
          await room.connect(alt.url, alt.token)
        }
        await room.startAudio()
        const s = settingsRef.current
        if (s.speakerId !== 'default') await room.switchActiveDevice('audiooutput', s.speakerId).catch(() => {})
        setChannelId(id)
        playSound('join')
        updatePresence({ voice_channel_id: id, muted, deafened, streaming: false })
        await syncMic(muted, false)
      } catch (e) {
        setError((e as Error).message)
        if (switched) {
          room.disconnect()
          cf.disconnect()
          cfOn.current = false
          setChannelId(null)
          updatePresence({ voice_channel_id: null, streaming: false })
        }
      } finally {
        setConnecting(false)
        bump()
      }
    },
    [room, cf, myId, channelId, connecting, muted, deafened, syncMic, micShouldBeOn, updatePresence],
  )

  const toggleMute = useCallback(() => {
    const next = !muted
    // Sağırken mikrofonu açmak sağırlığı da kapatır (alışılmış davranış)
    if (!next && deafened) {
      setDeafened(false)
      deafRef.current = false
      room.remoteParticipants.forEach(applyVolume)
      cf.setDeafened(false)
    }
    setMuted(next)
    playSound(next ? 'mute' : 'unmute')
    syncMic(next, pttActive)
    updatePresence({ muted: next, deafened: !next ? false : deafened })
  }, [muted, deafened, pttActive, room, cf, applyVolume, syncMic, updatePresence])

  const toggleDeafen = useCallback(() => {
    const next = !deafened
    setDeafened(next)
    deafRef.current = next
    room.remoteParticipants.forEach(applyVolume)
    cf.setDeafened(next)
    const nextMuted = next ? true : false
    setMuted(nextMuted)
    playSound(next ? 'mute' : 'unmute')
    syncMic(nextMuted, pttActive)
    updatePresence({ deafened: next, muted: nextMuted })
  }, [deafened, pttActive, room, cf, applyVolume, syncMic, updatePresence])

  const toggleCamera = useCallback(async () => {
    if (cfOn.current) {
      await cf.setCamera(!cf.cameraOn, settings.cameraId)
      return
    }
    if (room.state !== ConnectionState.Connected) return
    const on = room.localParticipant.isCameraEnabled
    try {
      await room.localParticipant.setCameraEnabled(!on, settings.cameraId ? { deviceId: settings.cameraId } : undefined)
    } catch (e) {
      setError(`Kamera açılamadı: ${(e as Error).message}`)
    }
    bump()
  }, [room, cf, settings.cameraId])

  const [pickerOpen, setPickerOpen] = useState(false)

  // Açmak: önce uygulama içi seçim penceresi. Kapatmak: anında.
  const toggleScreen = useCallback(async () => {
    if (cfOn.current) {
      if (cf.screenOn) {
        await cf.stopScreen()
        updatePresence({ streaming: false })
      } else setPickerOpen(true)
      return
    }
    if (room.state !== ConnectionState.Connected) return
    if (room.localParticipant.isScreenShareEnabled) {
      try {
        await room.localParticipant.setScreenShareEnabled(false)
      } catch (e) {
        setError(`Ekran paylaşımı kapatılamadı: ${(e as Error).message}`)
      }
      updatePresence({ streaming: false })
      bump()
      return
    }
    setPickerOpen(true)
  }, [room, cf, updatePresence])

  const startScreenShare = useCallback(
    async (choice: ShareChoice) => {
      setPickerOpen(false)
      shareAttempt.current = true
      if (cfOn.current) {
        try {
          const desktop = getDesktop()
          if (desktop && choice.sourceId) await desktop.selectSource(choice.sourceId, choice.audio)
          await cf.startScreen({ surface: choice.surface, audio: choice.audio, motion: choice.quality === 'game', ...CF_SHARE[choice.quality] })
          if (cf.screenOn) updatePresence({ streaming: true })
        } finally {
          window.setTimeout(() => (shareAttempt.current = false), 500)
        }
        return
      }
      if (room.state !== ConnectionState.Connected) return
      const preset = SHARE_PRESETS[choice.quality]
      // Yankı önleme: sistem sesi yakalanırken CSN'nin kendi çaldığı ses (arkadaşların konuşması)
      // yakalamaya girmesin (restrictOwnAudio; Chrome 141+ ve Electron 45 destekler). Yayın sesi
      // müzik/oyun olduğu için konuşma işlemleri kapalı.
      const screenAudio = {
        restrictOwnAudio: true,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } as MediaTrackConstraints
      const capture: ScreenShareCaptureOptions = {
        audio: choice.audio ? (screenAudio as ScreenShareCaptureOptions['audio']) : false,
        systemAudio: choice.audio ? 'include' : 'exclude',
        video: { displaySurface: choice.surface },
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        preferCurrentTab: false,
        contentHint: choice.quality === 'game' ? 'motion' : 'detail',
        resolution: preset.resolution,
      }
      const publish: TrackPublishOptions = { screenShareEncoding: preset.encoding }
      try {
        const desktop = getDesktop()
        // Masaüstü: kaynağı ana sürece bildir; getDisplayMedia tarayıcı penceresi açmadan o kaynağı alır
        if (desktop && choice.sourceId) await desktop.selectSource(choice.sourceId, choice.audio)
        await room.localParticipant.setScreenShareEnabled(true, capture, publish)
        updatePresence({ streaming: true })
      } catch (e) {
        const err = e as Error
        if (err.name !== 'NotAllowedError' && err.name !== 'AbortError')
          setError(`Ekran paylaşılamadı: ${err.message}`)
      } finally {
        window.setTimeout(() => (shareAttempt.current = false), 500)
      }
      bump()
    },
    [room, cf, updatePresence],
  )

  // Paylaşım dışarıdan biterse (tarayıcının "Paylaşmayı durdur" düğmesi, pencere kapanması) durumu düzelt
  useEffect(() => {
    const onLocalUnpub = (pub: TrackPublication) => {
      if (pub.source === Track.Source.ScreenShare) updatePresence({ streaming: false })
    }
    room.on(RoomEvent.LocalTrackUnpublished, onLocalUnpub)
    return () => {
      room.off(RoomEvent.LocalTrackUnpublished, onLocalUnpub)
    }
  }, [room, updatePresence])

  // Sesten çıkınca seçim penceresi açık kalmasın
  useEffect(() => {
    if (!channelId) setPickerOpen(false)
  }, [channelId])

  const setVolume = useCallback(
    (userId: string, v: number) => {
      setSettings((s) => {
        const next = { ...s, volumes: { ...s.volumes, [userId]: v } }
        settingsRef.current = next
        cf.setVolumes(next.volumes)
        return next
      })
      const p = room.remoteParticipants.get(userId)
      if (p) applyVolume(p)
    },
    [room, cf, applyVolume],
  )

  const setStreamVolume = useCallback(
    (userId: string, v: number) => {
      setSettings((s) => {
        const next = { ...s, streamVolumes: { ...(s.streamVolumes ?? {}), [userId]: v } }
        settingsRef.current = next
        cf.setStreamVolumes(next.streamVolumes)
        return next
      })
      const p = room.remoteParticipants.get(userId)
      if (p) applyVolume(p)
    },
    [room, cf, applyVolume],
  )

  const updateSettings = useCallback(
    (patch: Partial<VoiceSettings>) => {
      setSettings((s) => {
        const next = { ...s, ...patch }
        settingsRef.current = next
        return next
      })
      if (cfOn.current) {
        cf.updateSettings({ ...settingsRef.current, ...patch })
        if (patch.cameraId) cf.switchCamera(patch.cameraId)
        if (patch.inputMode) syncMic(muted, false)
        return
      }
      if (room.state !== ConnectionState.Connected) return
      if (patch.micId) room.switchActiveDevice('audioinput', patch.micId).catch(() => {})
      if (patch.speakerId) room.switchActiveDevice('audiooutput', patch.speakerId).catch(() => {})
      if (patch.cameraId && room.localParticipant.isCameraEnabled)
        room.switchActiveDevice('videoinput', patch.cameraId).catch(() => {})
      if (patch.inputMode || patch.noiseSuppression !== undefined || patch.echoCancellation !== undefined) {
        // Ayar değişince mikrofonu yeniden aç
        const run = async () => {
          await room.localParticipant.setMicrophoneEnabled(false)
          await syncMic(muted, false)
        }
        run()
      } else if (patch.aiNoise !== undefined) {
        applyNoiseProcessor()
      }
    },
    [room, cf, muted, syncMic, applyNoiseProcessor],
  )

  // Bas-konuş
  useEffect(() => {
    if (settings.inputMode !== 'ptt' || !channelId) {
      setPttActive(false)
      return
    }
    const down = (e: KeyboardEvent) => {
      if (e.code !== settings.pttKey || e.repeat || isTyping(e)) return
      setPttActive(true)
      syncMic(muted, true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== settings.pttKey) return
      setPttActive(false)
      syncMic(muted, false)
    }
    const blur = () => {
      setPttActive(false)
      syncMic(muted, false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [settings.inputMode, settings.pttKey, channelId, muted, syncMic])

  // Kota koruması (Cloudflare): görüntü yalnız sahne açıkken ve pencere görünürken indirilir.
  // Pencere 20 sn'den uzun gizli kalırsa görüntü bırakılır, geri gelince yeniden alınır. Ses hep gelir.
  const viewers = useRef(0)
  const hideTimer = useRef(0)
  const applyWatching = useCallback(() => {
    window.clearTimeout(hideTimer.current)
    if (viewers.current <= 0) cf.setVideoWanted(false)
    else if (document.visibilityState === 'visible') cf.setVideoWanted(true)
    else hideTimer.current = window.setTimeout(() => cf.setVideoWanted(false), 20_000)
  }, [cf])
  const setWatching = useCallback(
    (on: boolean) => {
      viewers.current += on ? 1 : -1
      applyWatching()
    },
    [applyWatching],
  )
  useEffect(() => {
    applyWatching()
    document.addEventListener('visibilitychange', applyWatching)
    return () => {
      document.removeEventListener('visibilitychange', applyWatching)
      window.clearTimeout(hideTimer.current)
    }
  }, [applyWatching])

  // Katılımcı listesi
  const participants = useMemo<VoiceParticipant[]>(() => {
    if (!channelId) return []
    if (cfOn.current) {
      const me: VoiceParticipant = {
        id: myId,
        name: profiles[myId]?.display_name ?? 'Üye',
        isLocal: true,
        speaking: cf.localSpeaking,
        micMuted: !cf.micOn,
        camera: cf.localCamera,
        screen: cf.localScreen,
        screenAudio: false,
      }
      return [
        me,
        ...cf.peers().map((p) => ({
          id: p.id,
          name: profiles[p.id]?.display_name ?? 'Üye',
          isLocal: false,
          speaking: p.speaking,
          micMuted: !p.hasMic || !!presence[p.id]?.muted,
          camera: p.camera,
          screen: p.screen,
          screenAudio: p.screenAudio,
        })),
      ]
    }
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()]
    return all.map((p) => {
      const cam = p.getTrackPublication(Track.Source.Camera)
      const scr = p.getTrackPublication(Track.Source.ScreenShare)
      const mic = p.getTrackPublication(Track.Source.Microphone)
      const scrAudio = p.getTrackPublication(Track.Source.ScreenShareAudio)
      return {
        id: p.identity,
        name: profiles[p.identity]?.display_name ?? p.name ?? 'Üye',
        isLocal: p instanceof LocalParticipant,
        speaking: p.isSpeaking,
        micMuted: !mic || mic.isMuted,
        camera: cam && !cam.isMuted ? cam.track : undefined,
        screen: scr && !scr.isMuted ? scr.track : undefined,
        screenAudio: !!scrAudio && !scrAudio.isMuted,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, channelId, room, cf, myId, presence, profiles])

  const value: VoiceState = {
    channelId,
    connecting: connecting || cf.reconnecting,
    error,
    participants,
    muted,
    deafened,
    cameraOn: !channelId ? false : cfOn.current ? cf.cameraOn : room.localParticipant.isCameraEnabled,
    screenOn: !channelId ? false : cfOn.current ? cf.screenOn : room.localParticipant.isScreenShareEnabled,
    pttActive,
    settings,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreen,
    setVolume,
    setStreamVolume,
    updateSettings,
    setWatching,
    clearError: () => setError(null),
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <div ref={audioHost} hidden />
      <ScreenSharePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onShare={startScreenShare} />
    </Ctx.Provider>
  )
}
