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
  camera?: Track
  screen?: Track
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
    [room, micShouldBeOn, applyNoiseProcessor],
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
      let switched = false
      try {
        // Önce anahtar alınır: oda doluysa ya da izin yoksa mevcut görüşme kopmaz
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
        switched = true
        if (room.state !== ConnectionState.Disconnected) await room.disconnect()
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
        if (switched) {
          room.disconnect()
          setChannelId(null)
          updatePresence({ voice_channel_id: null, streaming: false })
        }
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

  const [pickerOpen, setPickerOpen] = useState(false)

  // Açmak: önce uygulama içi seçim penceresi. Kapatmak: anında.
  const toggleScreen = useCallback(async () => {
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
  }, [room, updatePresence])

  const startScreenShare = useCallback(
    async (choice: ShareChoice) => {
      setPickerOpen(false)
      shareAttempt.current = true
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
    [room, updatePresence],
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
        return next
      })
      const p = room.remoteParticipants.get(userId)
      if (p) applyVolume(p)
    },
    [room, applyVolume],
  )

  const setStreamVolume = useCallback(
    (userId: string, v: number) => {
      setSettings((s) => {
        const next = { ...s, streamVolumes: { ...(s.streamVolumes ?? {}), [userId]: v } }
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
      } else if (patch.aiNoise !== undefined) {
        applyNoiseProcessor()
      }
    },
    [room, muted, syncMic, applyNoiseProcessor],
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
    setStreamVolume,
    updateSettings,
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
