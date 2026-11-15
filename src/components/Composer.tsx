import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { formatSize, uploadFile } from '../lib/files'
import type { Attachment, Channel, Message } from '../lib/types'
import Avatar from './Avatar'
import Icon from './Icon'
import GifPicker from './GifPicker'
import StickerPicker from './StickerPicker'
import VoiceRecorder, { voiceSupported, type VoiceClip } from './VoiceRecorder'
import { stickerMessage } from '../lib/stickers'
import { useVoice } from '../voice/VoiceContext'
import { runMusicCommand } from '../voice/musicCommands'
import { enqueue, fetchTitle, parseYouTubeId, useMusicRows } from '../voice/music'

const MAX_FILE = 25 * 1024 * 1024
const TYPING_TTL = 4000

interface Props {
  channel: Channel
  placeholder: string
  replyTo: Message | null
  onCancelReply: () => void
  onSend: (content: string, attachments: Attachment[]) => Promise<void>
  onEditLast: () => void
}

export default function Composer({ channel, placeholder, replyTo, onCancelReply, onSend, onEditLast }: Props) {
  const { userId, profiles, members, can } = useApp()
  const musicRows = useMusicRows()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const voice = useVoice()
  const [dragging, setDragging] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [typers, setTypers] = useState<Record<string, number>>({})
  const [mention, setMention] = useState<{ query: string; start: number; index: number } | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastTypingSent = useRef(0)

  // "yazıyor…" göstergesi
  useEffect(() => {
    const ch = supabase.channel(`typing-${channel.id}`)
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const id = payload?.user_id as string | undefined
      if (!id || id === userId) return
      setTypers((t) => ({ ...t, [id]: Date.now() }))
    }).subscribe()
    typingChannel.current = ch
    const timer = window.setInterval(() => {
      setTypers((t) => {
        const now = Date.now()
        const next = Object.fromEntries(Object.entries(t).filter(([, at]) => now - at < TYPING_TTL))
        return Object.keys(next).length === Object.keys(t).length ? t : next
      })
    }, 1000)
    return () => {
      window.clearInterval(timer)
      supabase.removeChannel(ch)
    }
  }, [channel.id, userId])

  useEffect(() => {
    if (replyTo) input.current?.focus()
  }, [replyTo])

  // Müzik komutu onayı birkaç saniye sonra kaybolsun
  useEffect(() => {
    if (!info) return
    const t = window.setTimeout(() => setInfo(null), 6000)
    return () => window.clearTimeout(t)
  }, [info])

  function notifyTyping() {
    const now = Date.now()
    if (now - lastTypingSent.current < 2500) return
    lastTypingSent.current = now
    typingChannel.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } })
  }

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list)
    const tooBig = arr.find((f) => f.size > MAX_FILE)
    if (tooBig) setError(`"${tooBig.name}" çok büyük (en fazla 25 MB).`)
    setFiles((prev) => [...prev, ...arr.filter((f) => f.size <= MAX_FILE)].slice(0, 10))
  }

  async function submit() {
    const content = text.trim()
    if ((!content && files.length === 0) || busy) return
    setBusy(true)
    setError(null)
    setInfo(null)
    // Müzik komutları (/çal, /geç…) mesaj olarak gönderilmez
    if (content.startsWith('/') && files.length === 0) {
      const r = await runMusicCommand(content, { voiceChannelId: voice.channelId, userId, textChannelId: channel.kind === 'dm' ? null : channel.id })
      if (r.handled) {
        if (r.ok) {
          setText('')
          setInfo(r.message ?? null)
        } else setError(r.message ?? 'Komut çalıştırılamadı')
        setBusy(false)
        requestAnimationFrame(() => input.current?.focus())
        return
      }
    }
    // Müzik botu bu kanaldan yönetiliyorsa: tek başına gönderilen YouTube bağlantısı sıraya eklenir
    const botRow = voice.channelId ? musicRows[voice.channelId] : null
    const linkId = files.length === 0 && /^\S+$/.test(content) ? parseYouTubeId(content) : null
    if (linkId && voice.channelId && botRow?.current && botRow.control_channel_id === channel.id) {
      try {
        const title = await fetchTitle(linkId)
        const r = await enqueue(voice.channelId, { videoId: linkId, title, addedBy: userId }, channel.id)
        setText('')
        setInfo(r === 'playing' ? `🎵 Çalıyor: ${title}` : `🎵 Sıraya eklendi: ${title}`)
      } catch (e) {
        setError((e as Error).message)
      }
      setBusy(false)
      requestAnimationFrame(() => input.current?.focus())
      return
    }
    try {
      const attachments: Attachment[] = []
      for (const f of files) {
        const path = await uploadFile(userId, f)
        attachments.push({ path, name: f.name, size: f.size, type: f.type || 'application/octet-stream' })
      }
      await onSend(content, attachments)
      setText('')
      setFiles([])
      lastTypingSent.current = 0
    } catch (e) {
      setError((e as Error).message || 'Mesaj gönderilemedi')
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  async function sendVoice(clip: VoiceClip) {
    setRecording(false)
    setBusy(true)
    setError(null)
    try {
      const path = await uploadFile(userId, clip.file)
      await onSend('', [{ path, name: clip.file.name, size: clip.file.size, type: clip.file.type, voice: true, duration: clip.duration, waveform: clip.waveform }])
    } catch (e) {
      setError((e as Error).message || 'Sesli mesaj gönderilemedi')
    } finally {
      setBusy(false)
      requestAnimationFrame(() => input.current?.focus())
    }
  }

  async function sendSticker(id: string) {
    setStickerOpen(false)
    setError(null)
    try {
      await onSend(stickerMessage(id), [])
    } catch (e) {
      setError((e as Error).message || 'Sticker gönderilemedi')
    }
    input.current?.focus()
  }

  async function sendGif(url: string) {
    setGifOpen(false)
    setError(null)
    try {
      await onSend(url, [])
    } catch (e) {
      setError((e as Error).message || 'GIF gönderilemedi')
    }
    input.current?.focus()
  }

  // @bahsetme önerileri
  const memberIds = new Set(members.map((m) => m.user_id))
  const suggestions = mention
    ? [
        ...Object.values(profiles)
          .filter((p) => memberIds.has(p.id) && p.display_name.toLocaleLowerCase('tr').includes(mention.query.toLocaleLowerCase('tr')))
          .slice(0, 8)
          .map((p) => ({ id: p.id, name: p.display_name })),
        ...(channel.kind !== 'dm' && can('mention_everyone') && 'herkes'.startsWith(mention.query.toLocaleLowerCase('tr')) ? [{ id: 'herkes', name: 'herkes' }] : []),
      ]
    : []

  function updateMention(value: string, caret: number) {
    const before = value.slice(0, caret)
    const m = before.match(/(?:^|\s)@([^\s@]{0,32})$/)
    setMention(m ? { query: m[1], start: caret - m[1].length - 1, index: 0 } : null)
  }

  function pickMention(name: string) {
    if (!mention) return
    const caret = input.current?.selectionStart ?? text.length
    const next = `${text.slice(0, mention.start)}@${name} ${text.slice(caret)}`
    setText(next)
    setMention(null)
    requestAnimationFrame(() => {
      const pos = mention.start + name.length + 2
      input.current?.setSelectionRange(pos, pos)
      input.current?.focus()
    })
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setMention({ ...mention, index: (mention.index + d + suggestions.length) % suggestions.length })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickMention(suggestions[mention.index]?.name ?? suggestions[0].name)
        return
      }
      if (e.key === 'Escape') {
        setMention(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    } else if (e.key === 'ArrowUp' && !text) {
      e.preventDefault()
      onEditLast()
    } else if (e.key === 'Escape' && replyTo) {
      onCancelReply()
    }
  }

  function onPaste(e: ClipboardEvent) {
    if (e.clipboardData.files.length) {
      e.preventDefault()
      addFiles(e.clipboardData.files)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  const typingNames = Object.keys(typers).map((id) => profiles[id]?.display_name ?? 'Biri')

  return (
    <div
      className={`composer-wrap${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {mention && suggestions.length > 0 && (
        <div className="mention-menu">
          <div className="small muted">Üyeler</div>
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              className={i === mention.index ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                pickMention(s.name)
              }}
            >
              {s.id !== 'herkes' && <Avatar profile={profiles[s.id]} userId={s.id} size={22} />}
              <span>{s.id === 'herkes' ? '@herkes, kanaldaki herkese bildirim' : s.name}</span>
            </button>
          ))}
        </div>
      )}
      {replyTo && (
        <div className="reply-bar">
          <span>
            <strong>{profiles[replyTo.author_id]?.display_name ?? 'Üye'}</strong> kişisine yanıt veriliyor
          </span>
          <button className="icon-btn small" onClick={onCancelReply}><Icon name="x" size={16} /></button>
        </div>
      )}
      {files.length > 0 && (
        <div className="pending-files">
          {files.map((f, i) => (
            <div key={i} className="pending-file">
              {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} alt="" /> : <Icon name="file" size={32} />}
              <span className="pending-name">{f.name}</span>
              <span className="small muted">{formatSize(f.size)}</span>
              <button className="pending-remove" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {recording ? (
        <VoiceRecorder onDone={sendVoice} onCancel={() => setRecording(false)} onError={(m) => setError(m)} />
      ) : (
      <div className="composer">
        <button className="icon-btn" onClick={() => fileInput.current?.click()} title="Dosya ekle">
          <Icon name="plusCircle" size={22} />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <textarea
          ref={input}
          value={text}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value)
            updateMention(e.target.value, e.target.selectionStart)
            if (e.target.value) notifyTyping()
          }}
          onKeyDown={onKey}
          onPaste={onPaste}
          onBlur={() => setTimeout(() => setMention(null), 100)}
          disabled={busy}
          autoFocus
        />
        <button className={`gif-toggle${gifOpen ? ' active' : ''}`} onClick={() => { setStickerOpen(false); setGifOpen((o) => !o) }} title="GIF gönder">
          GIF
        </button>
        <button className={`sticker-toggle${stickerOpen ? ' active' : ''}`} onClick={() => { setGifOpen(false); setStickerOpen((o) => !o) }} title="Sticker gönder">
          <Icon name="sticker" size={20} />
        </button>
        {voiceSupported() && (
          <button className="voice-toggle" onClick={() => { setGifOpen(false); setStickerOpen(false); setError(null); setRecording(true) }} disabled={busy} title="Sesli mesaj kaydet">
            <Icon name="mic" size={20} />
          </button>
        )}
      </div>
      )}
      {gifOpen && <GifPicker onPick={sendGif} onClose={() => setGifOpen(false)} />}
      {stickerOpen && <StickerPicker onPick={sendSticker} onClose={() => setStickerOpen(false)} />}
      <div className="composer-footer">
        {error ? (
          <span className="form-error inline">{error}</span>
        ) : info ? (
          <span className="composer-info">
            {info}
            <button className="icon-btn small" onClick={() => setInfo(null)} title="Kapat"><Icon name="x" size={12} /></button>
          </span>
        ) : typingNames.length > 0 ? (
          <span className="typing">
            <span className="typing-dots"><i /><i /><i /></span>
            <strong>{typingNames.slice(0, 3).join(', ')}</strong> {typingNames.length > 1 ? 'yazıyorlar…' : 'yazıyor…'}
          </span>
        ) : busy && !text.trim() && files.length === 0 ? (
          <span className="muted">Sesli mesaj gönderiliyor…</span>
        ) : busy && files.length ? (
          <span className="muted">Yükleniyor…</span>
        ) : null}
      </div>
    </div>
  )
}
