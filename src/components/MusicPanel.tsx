import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../lib/store'
import { useVoice } from '../voice/VoiceContext'
import {
  enqueue,
  fetchTitle,
  music,
  parseYouTubeId,
  pause,
  positionOf,
  removeFromQueue,
  resume,
  seek,
  skip,
  stop,
  thumbOf,
  useMusic,
} from '../voice/music'
import { MUSIC_HELP } from '../voice/musicCommands'
import AnchoredPopover from './Popover'
import Icon from './Icon'

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Çalan parça kartı (CallStage içinde, sağ üstte) */
export default function MusicPanel() {
  const voice = useVoice()
  const { profiles } = useApp()
  const snap = useMusic()
  const [, tick] = useState(0)
  const [showQueue, setShowQueue] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const row = snap.channelId === voice.channelId ? snap.row : null
  const current = row?.current ?? null

  useEffect(() => {
    if (!current || row?.paused) return
    const t = window.setInterval(() => tick((x) => x + 1), 500)
    return () => window.clearInterval(t)
  }, [current, row?.paused])

  if (!current || !voice.channelId) return null
  const ch = voice.channelId
  const pos = positionOf(row)
  const dur = snap.duration
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0
  const who = profiles[current.addedBy]?.display_name ?? 'Biri'

  async function run(fn: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function onSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (dur <= 0) return
    const r = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    run(() => seek(ch, ratio * dur))
  }

  if (collapsed) {
    return (
      <button className="music-chip" onClick={() => setCollapsed(false)} title="Müzik panelini aç">
        <span className="music-eq" data-paused={row?.paused ? '1' : undefined}><i /><i /><i /></span>
        <span className="music-chip-title">{current.title}</span>
      </button>
    )
  }

  return (
    <div className="music-panel">
      <div className="music-top">
        <img className="music-thumb" src={thumbOf(current.videoId)} alt="" />
        <div className="music-meta">
          <div className="music-title" title={current.title}>{current.title}</div>
          <div className="small muted">{who} ekledi{row?.paused ? ' · duraklatıldı' : ''}</div>
        </div>
        <button className="icon-btn small" onClick={() => setCollapsed(true)} title="Küçült">
          <Icon name="chevronDown" size={16} />
        </button>
      </div>

      <div className="music-progress" onClick={onSeek} title={dur > 0 ? 'Atlamak için tıkla' : undefined}>
        <div className="music-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="music-times small muted">
        <span>{fmt(pos)}</span>
        <span>{dur > 0 ? fmt(dur) : '--:--'}</span>
      </div>

      {snap.blocked && !snap.localMuted && (
        <button className="btn primary small block" onClick={() => music.unblock()}>▶ Müziği başlat</button>
      )}

      <div className="music-buttons">
        {row?.paused ? (
          <button className="icon-btn" disabled={busy} onClick={() => run(() => resume(ch))} title="Devam">▶</button>
        ) : (
          <button className="icon-btn" disabled={busy} onClick={() => run(() => pause(ch))} title="Duraklat">⏸</button>
        )}
        <button className="icon-btn" disabled={busy} onClick={() => run(() => skip(ch))} title="Geç">⏭</button>
        <button className="icon-btn" disabled={busy} onClick={() => run(() => stop(ch))} title="Durdur ve sırayı temizle">⏹</button>
        <button
          className={`icon-btn${showQueue ? ' active' : ''}`}
          onClick={() => setShowQueue((s) => !s)}
          title="Sıra"
        >
          ☰<span className="music-qcount">{row?.queue.length ?? 0}</span>
        </button>
      </div>

      <label className="music-volume" title="Yalnız sende değişir">
        <span className="small muted">Ses</span>
        <input
          type="range"
          min={0}
          max={100}
          value={snap.volume}
          onChange={(e) => music.setVolume(Number(e.target.value))}
        />
        <span className="small muted">{snap.volume}</span>
      </label>
      <button className={`btn ghost small${snap.localMuted ? ' danger-text' : ''}`} onClick={() => music.toggleLocalMute()}>
        <Icon name={snap.localMuted ? 'headphonesOff' : 'headphones'} size={16} /> {snap.localMuted ? 'Bende aç' : 'Bende kapat'}
      </button>

      {showQueue && (
        <div className="music-queue">
          {row && row.queue.length > 0 ? (
            row.queue.map((q, i) => (
              <div key={`${q.videoId}-${i}`} className="music-queue-item">
                <span className="muted small">{i + 1}.</span>
                <span className="music-queue-title" title={q.title}>{q.title}</span>
                <span className="muted small">{profiles[q.addedBy]?.display_name ?? ''}</span>
                <button className="icon-btn small" onClick={() => run(() => removeFromQueue(ch, i))} title="Sıradan çıkar">
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))
          ) : (
            <div className="small muted">Sıra boş. Eklemek için 🎵 düğmesi ya da sohbete /çal &lt;bağlantı&gt;</div>
          )}
        </div>
      )}
      {(err || snap.error) && <div className="form-error inline small">{err ?? snap.error}</div>}
    </div>
  )
}

/** .voice-controls içindeki "🎵 Müzik" düğmesi: bağlantı yapıştırma kutusu açar */
export function MusicButton() {
  const voice = useVoice()
  const { userId } = useApp()
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ch = voice.channelId
    if (!ch || busy) return
    const id = parseYouTubeId(link)
    if (!id) {
      setMsg({ ok: false, text: 'Geçerli bir YouTube bağlantısı değil' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const title = await fetchTitle(id)
      const r = await enqueue(ch, { videoId: id, title, addedBy: userId })
      setMsg({ ok: true, text: r === 'playing' ? `Çalıyor: ${title}` : `Sıraya eklendi: ${title}` })
      setLink('')
    } catch (er) {
      setMsg({ ok: false, text: (er as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        ref={btn}
        className={`round-btn music-btn${open ? ' on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Müzik (birlikte dinle)"
      >
        <span className="emoji-ico">🎵</span>
      </button>
      {open && (
        <AnchoredPopover anchor={btn} onClose={() => setOpen(false)} width={340}>
          <div className="popover-title">🎵 Birlikte dinle</div>
          <form className="music-add" onSubmit={submit}>
            <input
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="YouTube bağlantısı yapıştır"
              disabled={busy}
            />
            <button className="btn primary small" disabled={busy || !link.trim()}>
              {busy ? '…' : 'Çal'}
            </button>
          </form>
          {msg && <div className={msg.ok ? 'small music-ok' : 'form-error inline small'}>{msg.text}</div>}
          <div className="small muted">Kanaldaki herkes aynı anda duyar. Sohbette: {MUSIC_HELP}</div>
        </AnchoredPopover>
      )}
    </>
  )
}
