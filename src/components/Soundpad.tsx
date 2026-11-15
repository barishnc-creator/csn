import { useRef, useState, type FormEvent } from 'react'
import { useApp } from '../lib/store'
import { useVoice } from '../voice/VoiceContext'
import { addSound, deleteSound, soundpad, useSoundpad, validateSoundFile, type SoundItem } from '../voice/soundpad'
import AnchoredPopover from './Popover'
import Icon from './Icon'

/** Soundpad düğmesi + ses ızgarası. variant: 'round' (CallStage), 'pill' (VoiceBar) */
export default function SoundpadButton({ variant }: { variant: 'round' | 'pill' }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const cls = variant === 'round' ? 'round-btn' : 'pill-btn'
  return (
    <>
      <button
        ref={btn}
        className={`${cls} soundpad-btn${open ? ' on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Soundpad"
      >
        <Icon name="wave" size={variant === 'round' ? 22 : 18} />
      </button>
      {open && (
        <AnchoredPopover anchor={btn} onClose={() => setOpen(false)} width={340} className="soundpad-pop">
          <SoundpadGrid />
        </AnchoredPopover>
      )}
    </>
  )
}

function SoundpadGrid() {
  const { userId, myRole, profiles } = useApp()
  const voice = useVoice()
  const snap = useSoundpad()
  const isAdmin = myRole === 'admin'
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  function play(s: SoundItem) {
    const e = soundpad.send(s.id, userId)
    setErr(e)
    if (!e) {
      setFlash(s.id)
      window.setTimeout(() => setFlash((f) => (f === s.id ? null : f)), 400)
    }
  }

  async function remove(s: SoundItem) {
    if (!confirm(`"${s.name}" sesi silinsin mi?`)) return
    try {
      await deleteSound(s)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const last = snap.lastPlayed && Date.now() - snap.lastPlayed.at < 4000 ? snap.lastPlayed : null
  const lastSound = last ? snap.sounds.find((s) => s.id === last.id) : null

  return (
    <div className="soundpad">
      <div className="soundpad-head">
        <span className="popover-title">Soundpad</span>
        {isAdmin && !adding && (
          <button className="btn ghost small" onClick={() => setAdding(true)}>
            + Ses ekle
          </button>
        )}
      </div>

      {adding && isAdmin ? (
        <AddSoundForm userId={userId} onDone={() => setAdding(false)} />
      ) : (
        <>
          {!voice.channelId && <div className="small muted">Ses çalmak için bir ses kanalına katıl.</div>}
          {snap.sounds.length === 0 ? (
            <div className="small muted">{isAdmin ? 'Henüz ses yok. "+ Ses ekle" ile yükle.' : 'Henüz ses yok. Yöneticiler ses ekleyebilir.'}</div>
          ) : (
            <div className="soundpad-grid">
              {snap.sounds.map((s) => (
                <div key={s.id} className={`sound-tile${flash === s.id ? ' flash' : ''}`}>
                  <button className="sound-play" onClick={() => play(s)} disabled={!voice.channelId} title={s.name}>
                    <span className="sound-emoji">{s.emoji}</span>
                    <span className="sound-name">{s.name}</span>
                  </button>
                  {isAdmin && (
                    <button className="sound-del" onClick={() => remove(s)} title="Sil">
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <label className="music-volume" title="Yalnız sende değişir">
        <span className="small muted">Ses</span>
        <input type="range" min={0} max={100} value={snap.volume} onChange={(e) => soundpad.setVolume(Number(e.target.value))} />
        <span className="small muted">{snap.volume}</span>
      </label>
      {err && <div className="form-error inline small">{err}</div>}
      {!err && lastSound && last && (
        <div className="small muted">
          {lastSound.emoji} {profiles[last.by]?.display_name ?? 'Biri'}: {lastSound.name}
        </div>
      )}
    </div>
  )
}

function AddSoundForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🔊')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function pick(f: File | null) {
    setErr(null)
    if (!f) return setFile(null)
    const e = validateSoundFile(f)
    if (e) {
      setErr(e)
      setFile(null)
      return
    }
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 32))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setErr(null)
    try {
      await addSound(userId, file, name, emoji)
      onDone()
    } catch (er) {
      setErr((er as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sound-add" onSubmit={submit}>
      <label>
        Dosya (mp3 / ogg / wav, en fazla 1 MB)
        <input type="file" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </label>
      <div className="sound-add-row">
        <label className="sound-add-emoji">
          Emoji
          <input value={emoji} onChange={(e) => setEmoji(Array.from(e.target.value).slice(0, 8).join(''))} />
        </label>
        <label className="sound-add-name">
          Ad
          <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="ör. Alkış" />
        </label>
      </div>
      {err && <div className="form-error inline small">{err}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn ghost small" onClick={onDone} disabled={busy}>
          Vazgeç
        </button>
        <button className="btn primary small" disabled={!file || !name.trim() || busy}>
          {busy ? 'Yükleniyor…' : 'Ekle'}
        </button>
      </div>
    </form>
  )
}
