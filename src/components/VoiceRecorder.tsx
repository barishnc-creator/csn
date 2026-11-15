import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

/** Sesli mesaj kaydı: en fazla 5 dakika */
export const MAX_VOICE_SECONDS = 300
const BARS = 48

export interface VoiceClip {
  file: File
  duration: number
  waveform: number[]
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null
  for (const t of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

export function voiceSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && pickMime() !== null
}

function downsample(levels: number[], n: number) {
  if (levels.length === 0) return Array(n).fill(0.05)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * levels.length) / n)
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / n))
    let m = 0
    for (let j = a; j < b && j < levels.length; j++) m = Math.max(m, levels[j])
    out.push(m)
  }
  const peak = Math.max(...out, 0.01)
  return out.map((v) => Math.round(Math.max(0.06, Math.min(1, v / peak)) * 100) / 100)
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Kayıt çubuğu: açılır açılmaz mikrofonu açıp kaydetmeye başlar.
 * Gönder → onDone(klip), Vazgeç → onCancel().
 */
export default function VoiceRecorder({ onDone, onCancel, onError }: { onDone: (clip: VoiceClip) => void; onCancel: () => void; onError: (msg: string) => void }) {
  const [seconds, setSeconds] = useState(0)
  const [live, setLive] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const levels = useRef<number[]>([])
  const startedAt = useRef(0)
  const sendOnStop = useRef(false)
  const cleanup = useRef<() => void>(() => {})
  const cb = useRef({ onDone, onCancel, onError })
  cb.current = { onDone, onCancel, onError }

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let timer = 0
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        const mime = pickMime() || undefined
        const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined)
        rec.current = r
        r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data)
        r.onstop = () => {
          const duration = Math.max(1, Math.round((performance.now() - startedAt.current) / 100) / 10)
          cleanup.current()
          if (!sendOnStop.current) return
          const type = (r.mimeType || mime || 'audio/webm').split(';')[0]
          const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
          const blob = new Blob(chunks.current, { type })
          if (blob.size === 0) return cb.current.onError('Ses kaydedilemedi')
          const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
          cb.current.onDone({ file: new File([blob], `sesli-mesaj-${stamp}.${ext}`, { type }), duration, waveform: downsample(levels.current, BARS) })
        }
        // Dalga biçimi için ses seviyesi
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Uint8Array(analyser.fftSize)
        r.start(250)
        startedAt.current = performance.now()
        setReady(true)
        timer = window.setInterval(() => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (const v of buf) sum += ((v - 128) / 128) ** 2
          const rms = Math.sqrt(sum / buf.length)
          levels.current.push(rms)
          setLive((l) => [...l.slice(-31), rms])
          const s = (performance.now() - startedAt.current) / 1000
          setSeconds(s)
          if (s >= MAX_VOICE_SECONDS) stop(true)
        }, 100)
      } catch (e) {
        const name = (e as DOMException)?.name
        cb.current.onError(name === 'NotAllowedError' ? 'Mikrofon izni verilmedi' : name === 'NotFoundError' ? 'Mikrofon bulunamadı' : 'Kayıt başlatılamadı')
        cb.current.onCancel()
      }
    })()
    cleanup.current = () => {
      window.clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close().catch(() => {})
    }
    return () => {
      cancelled = true
      sendOnStop.current = false
      if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
      cleanup.current()
    }
  }, [])

  function stop(send: boolean) {
    sendOnStop.current = send
    const r = rec.current
    if (r && r.state !== 'inactive') r.stop()
    else if (!send) cleanup.current()
    if (!send) cb.current.onCancel()
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop(false)
      else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        stop(true)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const peak = Math.max(0.02, ...live)
  return (
    <div className="voice-recorder">
      <button className="icon-btn danger" onClick={() => stop(false)} title="Vazgeç (Esc)"><Icon name="trash" size={18} /></button>
      <span className={`rec-dot${ready ? ' on' : ''}`} />
      <span className="rec-time">{fmt(seconds)}</span>
      <div className="rec-wave" aria-hidden>
        {Array.from({ length: 32 }, (_, i) => {
          const v = live[i - (32 - live.length)] ?? 0
          return <i key={i} style={{ height: `${Math.max(8, Math.min(100, (v / peak) * 100))}%` }} />
        })}
      </div>
      <span className="rec-hint">{ready ? `Kaydediliyor · en fazla ${MAX_VOICE_SECONDS / 60} dk` : 'Mikrofon açılıyor…'}</span>
      <button className="btn success small rec-send" onClick={() => stop(true)} disabled={!ready} title="Gönder (Enter)">
        <Icon name="check" size={16} /> Gönder
      </button>
    </div>
  )
}

/** Mesajdaki sesli mesaj oynatıcısı */
export function VoiceMessage({ url, duration, waveform }: { url: string | null; duration?: number; waveform?: number[] }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [total, setTotal] = useState(duration ?? 0)
  const bars = waveform && waveform.length ? waveform : Array.from({ length: BARS }, (_, i) => 0.25 + 0.35 * Math.abs(Math.sin(i * 1.7)))
  const progress = total > 0 ? Math.min(1, time / total) : 0

  function toggle() {
    const a = audio.current
    if (!a) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audio.current
    if (!a || !total) return
    const r = e.currentTarget.getBoundingClientRect()
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total
    setTime(a.currentTime)
  }

  return (
    <div className={`voice-message${playing ? ' playing' : ''}`}>
      <button className="voice-play" onClick={toggle} disabled={!url} title={playing ? 'Duraklat' : 'Oynat'}>
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <div className="voice-bars" onClick={seek} role="slider" aria-label="Sesli mesaj" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(time)}>
        {bars.map((v, i) => (
          <i key={i} className={i / bars.length < progress ? 'done' : ''} style={{ height: `${Math.round(v * 100)}%` }} />
        ))}
      </div>
      <span className="voice-time">{fmt(playing || time > 0 ? time : total)}</span>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setTime(0) }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setTotal(d) }}
        />
      )}
    </div>
  )
}
