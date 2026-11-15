import { confirmDialog } from '../lib/dialog'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../lib/store'
import { useVoice } from '../voice/VoiceContext'
import { addSound, deleteSound, soundpad, useSoundpad, validateSoundFile, type SoundItem } from '../voice/soundpad'
import { comboFromEvent, comboLabel, isSingleKey, isTypingTarget, soundpadKeys, useSoundpadKeys } from '../voice/soundpadKeys'
import { getDesktop } from '../lib/desktop'
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

/** Soundpad kısayollarını dinler (ses kanalındayken). Layout'ta bir kez çizilir. */
export function SoundpadHotkeys() {
  const { userId } = useApp()
  const voice = useVoice()
  const inVoice = !!voice.channelId
  useEffect(() => {
    if (!inVoice) return
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      const combo = comboFromEvent(e)
      if (!combo) return
      const id = soundpadKeys.find(combo)
      if (!id) return
      // Tek tuşlu kısayol mesaj yazarken çalmaz
      if (isSingleKey(combo) && isTypingTarget(e)) return
      e.preventDefault()
      soundpad.send(id, userId)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [inVoice, userId])

  // Masaüstü (0.1.4+): CSN arka plandayken (oyun, başka uygulama) de çalışsın
  const keys = useSoundpadKeys()
  useEffect(() => {
    const d = getDesktop()
    if (!d?.setHotkeys) return
    d.setHotkeys(inVoice ? Object.entries(keys).map(([id, combo]) => ({ id, combo })) : []).catch(() => {})
  }, [inVoice, keys])
  useEffect(() => {
    const d = getDesktop()
    if (!d?.onHotkey || !inVoice) return
    const off = d.onHotkey((id) => soundpad.send(id, userId))
    return () => {
      off()
      d.setHotkeys?.([]).catch(() => {})
    }
  }, [inVoice, userId])
  return null
}

function SoundpadGrid() {
  const { userId, myRole, profiles, can } = useApp()
  const voice = useVoice()
  const snap = useSoundpad()
  const isAdmin = myRole === 'admin'
  // Ses ekleme: yöneticiler + "Soundpad'e ses ekleyebilir" yetkili roller
  const canAdd = isAdmin || can('manage_sounds')
  const canDelete = (s: SoundItem) => isAdmin || (canAdd && s.created_by === userId)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const keys = useSoundpadKeys()
  // Tuş atama: hangi ses için kombinasyon bekleniyor
  const [binding, setBinding] = useState<string | null>(null)
  useEffect(() => {
    if (!binding) return
    const down = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.code === 'Escape') return setBinding(null)
      if (e.code === 'Backspace' || e.code === 'Delete') {
        soundpadKeys.clear(binding)
        return setBinding(null)
      }
      const combo = comboFromEvent(e)
      if (!combo) return // yalnız Ctrl/Alt/Shift: asıl tuşu bekle
      if (combo === voice.settings.pttKey) return // bas-konuş tuşu ayrılmış
      soundpadKeys.set(binding, combo)
      setBinding(null)
    }
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }, [binding, voice.settings.pttKey])

  function play(s: SoundItem) {
    const e = soundpad.send(s.id, userId)
    setErr(e)
    if (!e) {
      setFlash(s.id)
      window.setTimeout(() => setFlash((f) => (f === s.id ? null : f)), 400)
    }
  }

  async function remove(s: SoundItem) {
    if (!(await confirmDialog({ title: `"${s.name}" sesi silinsin mi?`, confirmText: 'Sesi sil', danger: true }))) return
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
        {canAdd && !adding && (
          <button className="btn ghost small" onClick={() => setAdding(true)}>
            + Ses ekle
          </button>
        )}
      </div>

      {adding && canAdd ? (
        <AddSoundForm userId={userId} onDone={() => setAdding(false)} />
      ) : (
        <>
          {!voice.channelId && <div className="small muted">Ses çalmak için bir ses kanalına katıl.</div>}
          {snap.sounds.length === 0 ? (
            <div className="small muted">{canAdd ? 'Henüz ses yok. "+ Ses ekle" ile yükle.' : 'Henüz ses yok. Yetkili kişiler ses ekleyebilir.'}</div>
          ) : (
            <div className="soundpad-grid">
              {snap.sounds.map((s) => (
                <div key={s.id} className={`sound-tile${flash === s.id ? ' flash' : ''}`}>
                  <button className="sound-play" onClick={() => play(s)} disabled={!voice.channelId} title={keys[s.id] ? `${s.name} · ${comboLabel(keys[s.id])}` : s.name}>
                    <span className="sound-emoji">{s.emoji}</span>
                    <span className="sound-name">{s.name}</span>
                  </button>
                  <button
                    className={`sound-key${keys[s.id] ? ' set' : ''}${binding === s.id ? ' capturing' : ''}`}
                    onClick={() => setBinding(binding === s.id ? null : s.id)}
                    title={keys[s.id] ? 'Kısayolu değiştir' : 'Kısayol ata'}
                  >
                    {binding === s.id ? 'Bir tuşa bas…' : keys[s.id] ? comboLabel(keys[s.id]) : '⌨ Tuş ata'}
                  </button>
                  {canDelete(s) && (
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

      {binding && (
        <div className="small sound-bind-hint">
          Kısayol için bir tuşa bas (ör. 1, Q, F2; istersen Ctrl/Alt ile). Esc: vazgeç · Backspace: kaldır
        </div>
      )}
      {!binding && Object.keys(keys).length > 0 && (
        <div className="small muted">
          {getDesktop()?.setHotkeys
            ? 'Kısayollar CSN arka plandayken de (oyunda, başka uygulamada) çalışır.'
            : 'Kısayollar yalnız CSN açıkken çalışır; oyunda ve diğer uygulamalarda da çalışması için masaüstü uygulamasını kullan.'}
        </div>
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
