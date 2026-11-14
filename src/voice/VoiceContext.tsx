import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import {
  ConnectionState,
  LocalParticipant,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type RemoteTrack,
  type TrackPublication,
} from 'livekit-client'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { playSound } from './sounds'

export type InputMode = 'vad' | 'ptt'

export interface VoiceSettings {
  inputMode: InputMode
  pttKey: string // KeyboardEvent.code
  micId: string
  speakerId: string
  cameraId: string
  noiseSuppression: boolean
  echoCancellation: boolean
  volumes: Record<string, number> // kullanıcı id → 0..2
}

export interface VoiceParticipant {
  id: string
  name: string
  isLocal: boolean
  speaking: boolean
  micMuted: boolean
  camera?: Track
  screen?: Track
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
  updateSettings: (patch: Partial<VoiceSettings>) => void
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
  volumes: {},
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
  const { updatePresence, profiles } = useApp()
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
    const v = deafRef.current ? 0 : settingsRef.current.volumes[p.identity] ?? 1
    p.setVolume(v, Track.Source.Microphone)
    p.setVolume(v, Track.Source.ScreenShareAudio)
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
      .on(RoomEvent.MediaDevicesError, (e: Error) => setError(`Cihaz hatası: ${e.message}`))
    return () => {
      room.removeAllListeners()
      room.disconnect()
    }
  }, [room, applyVolume])

  const micShouldBeOn = useCallback(
    (m: boolean, ptt: boolean) => !m && (settingsRef.current.inputMode === 'vad' || ptt),
    [],
  )

  const syncMic = useCallback(
    async (m: boolean, ptt: boolean) => {
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
      bump()
    },
    [room, micShouldBeOn],
  )

  const leave = useCallback(() => {
    if (room.state !== ConnectionState.Disconnected) playSound('leave')
    room.disconnect()
    setChannelId(null)
    updatePresence({ voice_channel_id: null, streaming: false })
  }, [room, updatePresence])

  const join = useCallback(
    async (id: string) => {
      if (id === channelId || connecting) return
      setError(null)
      setConnecting(true)
      try {
        if (room.state !== ConnectionState.Disconnected) await room.disconnect()
        const { data, error } = await supabase.functions.invoke<{ token: string; url: string; error?: string }>(
          'livekit-token',
          { body: { channelId: id } },
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
        await room.connect(data.url, data.token)
        await room.startAudio()
        const s = settingsRef.current
        if (s.speakerId !== 'default') await room.switchActiveDevice('audiooutput', s.speakerId).catch(() => {})
        setChannelId(id)
        playSound('join')
        updatePresence({ voice_channel_id: id, muted, deafened, streaming: false })
        await syncMic(muted, false)
      } catch (e) {
        setError((e as Error).message)
        room.disconnect()
        setChannelId(null)
      } finally {
        setConnecting(false)
        bump()
      }
    },
    [room, channelId, connecting, muted, deafened, syncMic, updatePresence],
  )

  const toggleMute = useCallback(() => {
    const next = !muted
    // Sağırken mikrofonu açmak sağırlığı da kapatır (alışılmış davranış)
    if (!next && deafened) {
      setDeafened(false)
      deafRef.current = false
      room.remoteParticipants.forEach(applyVolume)
    }
    setMuted(next)
    playSound(next ? 'mute' : 'unmute')
    syncMic(next, pttActive)
    updatePresence({ muted: next, deafened: !next ? false : deafened })
  }, [muted, deafened, pttActive, room, applyVolume, syncMic, updatePresence])

  const toggleDeafen = useCallback(() => {
    const next = !deafened
    setDeafened(next)
    deafRef.current = next
    room.remoteParticipants.forEach(applyVolume)
    const nextMuted = next ? true : false
    setMuted(nextMuted)
    playSound(next ? 'mute' : 'unmute')
    syncMic(nextMuted, pttActive)
    updatePresence({ deafened: next, muted: nextMuted })
  }, [deafened, pttActive, room, applyVolume, syncMic, updatePresence])

  const toggleCamera = useCallback(async () => {
    if (room.state !== ConnectionState.Connected) return
    const on = room.localParticipant.isCameraEnabled
    try {
      await room.localParticipant.setCameraEnabled(!on, settings.cameraId ? { deviceId: settings.cameraId } : undefined)
    } catch (e) {
      setError(`Kamera açılamadı: ${(e as Error).message}`)
    }
    bump()
  }, [room, settings.cameraId])

  const toggleScreen = useCallback(async () => {
    if (room.state !== ConnectionState.Connected) return
    const on = room.localParticipant.isScreenShareEnabled
    try {
      await room.localParticipant.setScreenShareEnabled(!on, {
        audio: true,
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        contentHint: 'detail',
        resolution: ScreenSharePresets.h1080fps30.resolution,
      })
      updatePresence({ streaming: !on })
    } catch (e) {
      const err = e as Error
      if (err.name !== 'NotAllowedError') setError(`Ekran paylaşılamadı: ${err.message}`)
    }
    bump()
  }, [room, updatePresence])

  const setVolume = useCallback(
    (userId: string, v: number) => {
      setSettings((s) => {
        const next = { ...s, volumes: { ...s.volumes, [userId]: v } }
        settingsRef.current = next
        return next
      })
      const p = room.remoteParticipants.get(userId)
      if (p) applyVolume(p)
    },
    [room, applyVolume],
  )

  const updateSettings = useCallback(
    (patch: Partial<VoiceSettings>) => {
      setSettings((s) => {
        const next = { ...s, ...patch }
        settingsRef.current = next
        return next
      })
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
      }
    },
    [room, muted, syncMic],
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

  // Katılımcı listesi
  const participants = useMemo<VoiceParticipant[]>(() => {
    if (!channelId) return []
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()]
    return all.map((p) => {
      const cam = p.getTrackPublication(Track.Source.Camera)
      const scr = p.getTrackPublication(Track.Source.ScreenShare)
      const mic = p.getTrackPublication(Track.Source.Microphone)
      return {
        id: p.identity,
        name: profiles[p.identity]?.display_name ?? p.name ?? 'Üye',
        isLocal: p instanceof LocalParticipant,
        speaking: p.isSpeaking,
        micMuted: !mic || mic.isMuted,
        camera: cam && !cam.isMuted ? cam.track : undefined,
        screen: scr && !scr.isMuted ? scr.track : undefined,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, channelId, room, profiles])

  const value: VoiceState = {
    channelId,
    connecting,
    error,
    participants,
    muted,
    deafened,
    cameraOn: channelId ? room.localParticipant.isCameraEnabled : false,
    screenOn: channelId ? room.localParticipant.isScreenShareEnabled : false,
    pttActive,
    settings,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreen,
    setVolume,
    updateSettings,
    clearError: () => setError(null),
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <div ref={audioHost} hidden />
    </Ctx.Provider>
  )
}
