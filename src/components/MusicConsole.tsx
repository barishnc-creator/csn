import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { useVoice } from '../voice/VoiceContext'
import {
  LOOP_LABEL,
  LOOP_ORDER,
  MUSIC_BOT_ID,
  music,
  pause,
  positionOf,
  removeFromQueue,
  resume,
  seek,
  setLoop,
  skip,
  stop,
  thumbOf,
  useMusic,
  useMusicRows,
} from '../voice/music'
import { confirmDialog } from '../lib/dialog'
import Avatar from './Avatar'
import Icon from './Icon'

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Revize #18: müzik komutunun yazıldığı metin kanalında açılan kontrol konsolu */
export default function MusicConsole({ textChannelId }: { textChannelId: string }) {
  const rows = useMusicRows()
  const snap = useMusic()
  const voice = useVoice()
  const { profiles, channels } = useApp()
  const [, tick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showQueue, setShowQueue] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const row = Object.values(rows).find((r) => r.current && r.control_channel_id === textChannelId) ?? null
  const current = row?.current ?? null

  useEffect(() => {
    if (!current || row?.paused) return
    const t = window.setInterval(() => tick((x) => x + 1), 500)
    return () => window.clearInterval(t)
  }, [current, row?.paused])

  if (!row || !current) return null
  const ch = row.channel_id
  const voiceName = channels.find((c) => c.id === ch)?.name ?? 'ses kanalı'
  const here = voice.channelId === ch
  const dur = here && snap.channelId === ch ? snap.duration : 0
  const pos = positionOf(row)
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0
  const loop = row.loop ?? 'off'
  const nextLoop = LOOP_ORDER[(LOOP_ORDER.indexOf(loop) + 1) % LOOP_ORDER.length]

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
    run(() => seek(ch, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur))
  }

  return (
    <div className={`music-console${collapsed ? ' collapsed' : ''}`}>
      <div className="mc-main">
        <Avatar profile={profiles[MUSIC_BOT_ID]} userId={MUSIC_BOT_ID} size={collapsed ? 26 : 40} spinning={!row.paused} />
        {!collapsed && <img className="mc-thumb" src={thumbOf(current.videoId)} alt="" />}
        <div className="mc-meta">
          <div className="mc-title" title={current.title}>{current.title}</div>
          <div className="mc-sub">
            <Icon name="speaker" size={12} /> {voiceName} · {profiles[current.addedBy]?.display_name ?? 'Biri'} ekledi
            {row.paused ? ' · duraklatıldı' : ''}
          </div>
        </div>
        <div className="mc-buttons">
          {row.paused ? (
            <button className="mc-btn primary" disabled={busy} onClick={() => run(() => resume(ch))} title="Devam et"><Icon name="play" size={18} /></button>
          ) : (
            <button className="mc-btn primary" disabled={busy} onClick={() => run(() => pause(ch))} title="Duraklat"><Icon name="pause" size={18} /></button>
          )}
          <button className="mc-btn" disabled={busy} onClick={() => run(() => skip(ch))} title="Sıradakine geç"><Icon name="skip" size={17} /></button>
          <button
            className={`mc-btn${loop !== 'off' ? ' on' : ''}`}
            disabled={busy}
            onClick={() => run(() => setLoop(ch, nextLoop))}
            title={`${LOOP_LABEL[loop]} (tıkla: ${LOOP_LABEL[nextLoop].toLocaleLowerCase('tr')})`}
          >
            <Icon name={loop === 'one' ? 'repeatOne' : 'repeat'} size={17} />
          </button>
          <button className={`mc-btn${showQueue ? ' on' : ''}`} onClick={() => setShowQueue((s) => !s)} title="Sıra">
            <Icon name="queue" size={17} />
            {row.queue.length > 0 && <span className="mc-count">{row.queue.length}</span>}
          </button>
          <button
            className="mc-btn danger"
            disabled={busy}
            onClick={async () => {
              if (await confirmDialog({ title: 'Müzik durdurulsun mu?', message: 'Çalan parça durur ve sıra temizlenir.', confirmText: 'Durdur', danger: true })) run(() => stop(ch))
            }}
            title="Durdur ve sırayı temizle"
          >
            <Icon name="stop" size={15} />
          </button>
          <button className="mc-btn ghost" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Genişlet' : 'Küçült'}>
            <Icon name="chevronDown" size={16} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mc-bottom">
          <span className="mc-time">{fmt(pos)}</span>
          <div className={`mc-progress${dur > 0 ? ' seekable' : ''}`} onClick={onSeek} title={dur > 0 ? 'Atlamak için tıkla' : undefined}>
            <div className="mc-progress-fill" style={{ width: dur > 0 ? `${pct}%` : '100%', opacity: dur > 0 ? 1 : 0.25 }} />
          </div>
          <span className="mc-time">{dur > 0 ? fmt(dur) : '--:--'}</span>
          <label className="mc-volume" title={here ? 'Yalnız senin duyduğun sesi değiştirir' : 'Ses kanalına katılınca duyarsın'}>
            <Icon name={snap.volume === 0 ? 'headphonesOff' : 'speaker'} size={15} />
            <input type="range" min={0} max={100} value={snap.volume} onChange={(e) => music.setVolume(Number(e.target.value))} />
            <span>{snap.volume}</span>
          </label>
        </div>
      )}

      {here && snap.blocked && !snap.localMuted && (
        <button className="btn primary small mc-unblock" onClick={() => music.unblock()}><Icon name="play" size={14} /> Müziği başlat (tarayıcı izin istiyor)</button>
      )}

      {showQueue && (
        <div className="mc-queue">
          {row.queue.length > 0 ? (
            row.queue.map((q, i) => (
              <div key={`${q.videoId}-${i}`} className="mc-queue-item">
                <span className="mc-qn">{i + 1}</span>
                <img src={thumbOf(q.videoId)} alt="" />
                <span className="mc-queue-title" title={q.title}>{q.title}</span>
                <span className="muted small">{profiles[q.addedBy]?.display_name ?? ''}</span>
                <button className="icon-btn small" onClick={() => run(() => removeFromQueue(ch, i))} title="Sıradan çıkar"><Icon name="x" size={14} /></button>
              </div>
            ))
          ) : (
            <div className="small muted mc-empty">Sıra boş. Bu kanala YouTube bağlantısı yapıştır ya da <code>/çal &lt;bağlantı&gt;</code> yaz; sıraya eklenir.</div>
          )}
        </div>
      )}
      {(err || (here && snap.error)) && <div className="form-error inline small mc-err">{err ?? snap.error}</div>}
    </div>
  )
}
