import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { formatStamp, formatTime } from '../lib/format'
import { formatSize, signedUrl } from '../lib/files'
import { mentionsMe, renderMarkdown } from '../lib/markdown'
import type { Attachment, Message, Reaction } from '../lib/types'
import Avatar from './Avatar'
import Icon from './Icon'

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀', '💯', '🙏', '😎', '✅']

interface Props {
  message: Message
  grouped: boolean
  replied: Message | null
  reactions?: Reaction[]
  editing: boolean
  canDelete: boolean
  canPin: boolean
  onReply: () => void
  onEdit: () => void
  onEditDone: () => void
  onJump: (id: number) => void
}

function MessageItem({ message: m, grouped, replied, reactions, editing, canDelete, canPin, onReply, onEdit, onEditDone, onJump }: Props) {
  const { profiles, userId, me, openProfile, nameColor, openUserMenu } = useApp()
  const [picker, setPicker] = useState(false)
  const author = profiles[m.author_id]
  const names = Object.values(profiles).map((p) => p.display_name)
  const mine = m.author_id === userId
  const highlighted = !mine && mentionsMe(m.content, me?.display_name)

  async function remove() {
    if (!confirm('Bu mesaj silinsin mi?')) return
    await supabase.from('messages').delete().eq('id', m.id)
  }

  async function togglePin() {
    const { error } = await supabase.rpc('toggle_pin', { mid: m.id })
    if (error) alert(error.message)
  }

  async function react(emoji: string) {
    setPicker(false)
    const exists = reactions?.some((r) => r.user_id === userId && r.emoji === emoji)
    if (exists) await supabase.from('reactions').delete().match({ message_id: m.id, user_id: userId, emoji })
    else await supabase.from('reactions').insert({ message_id: m.id, emoji })
  }

  // Tepkileri emoji başına grupla
  const groups: { emoji: string; users: string[] }[] = []
  for (const r of reactions ?? []) {
    const g = groups.find((x) => x.emoji === r.emoji)
    if (g) g.users.push(r.user_id)
    else groups.push({ emoji: r.emoji, users: [r.user_id] })
  }

  return (
    <div tabIndex={-1} className={`message${grouped ? ' grouped' : ''}${highlighted ? ' mentioned' : ''}${m.pinned_at ? ' pinned' : ''}`}>
      {m.reply_to ? (
        <div className="reply-ref" onClick={() => m.reply_to && onJump(m.reply_to)}>
          <span className="reply-line" />
          {replied ? (
            <>
              <Avatar profile={profiles[replied.author_id]} userId={replied.author_id} size={16} />
              <strong style={{ color: nameColor(replied.author_id) }}>{profiles[replied.author_id]?.display_name ?? 'Üye'}</strong>
              <span className="reply-snippet">{replied.content || 'Ek dosya'}</span>
            </>
          ) : (
            <span className="reply-snippet muted">Eski bir mesaja yanıt</span>
          )}
        </div>
      ) : null}
      <div className="message-row">
        <div className="message-gutter">
          {grouped ? (
            <span className="hover-time">{formatTime(m.created_at)}</span>
          ) : (
            <button className="avatar-btn" onClick={() => openProfile(m.author_id)} onContextMenu={(e) => { e.preventDefault(); openUserMenu(m.author_id, e.clientX, e.clientY) }}>
              <Avatar profile={author} userId={m.author_id} size={40} />
            </button>
          )}
        </div>
        <div className="message-body">
          {!grouped && (
            <div className="message-head">
              <button className="author" style={{ color: nameColor(m.author_id) }} onClick={() => openProfile(m.author_id)} onContextMenu={(e) => { e.preventDefault(); openUserMenu(m.author_id, e.clientX, e.clientY) }}>
                {author?.display_name ?? 'Eski üye'}
              </button>
              <span className="stamp">{formatStamp(m.created_at)}</span>
              {m.pinned_at && <span className="pin-tag" title="Sabitlendi"><Icon name="pin" size={12} /></span>}
            </div>
          )}
          {editing ? (
            <EditBox message={m} onDone={onEditDone} />
          ) : (
            m.content && (
              <div className="message-content">
                {renderMarkdown(m.content, names, me?.display_name)}
                {m.edited_at && <span className="edited" title={formatStamp(m.edited_at)}> (düzenlendi)</span>}
              </div>
            )
          )}
          {m.attachments.length > 0 && (
            <div className="attachments">
              {m.attachments.map((a) => (
                <AttachmentView key={a.path} a={a} />
              ))}
            </div>
          )}
          {groups.length > 0 && (
            <div className="reactions">
              {groups.map((g) => (
                <button
                  key={g.emoji}
                  className={`reaction${g.users.includes(userId) ? ' mine' : ''}`}
                  onClick={() => react(g.emoji)}
                  title={g.users.map((u) => profiles[u]?.display_name ?? 'Üye').join(', ')}
                >
                  <span>{g.emoji}</span>
                  <span className="reaction-count">{g.users.length}</span>
                </button>
              ))}
              <button className="reaction add" onClick={() => setPicker(true)} title="Tepki ekle"><Icon name="smile" size={16} /></button>
            </div>
          )}
        </div>
      </div>
      {!editing && (
        <div className="message-actions">
          {QUICK_EMOJIS.slice(0, 3).map((e) => (
            <button key={e} className="emoji-quick" onClick={() => react(e)} title={`${e} tepkisi`}>{e}</button>
          ))}
          <button onClick={() => setPicker((p) => !p)} title="Tepki ekle"><Icon name="smile" size={18} /></button>
          <button onClick={onReply} title="Yanıtla"><Icon name="reply" size={18} /></button>
          {canPin && (
            <button onClick={togglePin} title={m.pinned_at ? 'Sabitlemeyi kaldır' : 'Sabitle'} className={m.pinned_at ? 'on' : ''}>
              <Icon name="pin" size={18} />
            </button>
          )}
          {mine && <button onClick={onEdit} title="Düzenle"><Icon name="edit" size={18} /></button>}
          {canDelete && <button className="danger" onClick={remove} title="Sil"><Icon name="trash" size={18} /></button>}
        </div>
      )}
      {picker && <EmojiPicker onPick={react} onClose={() => setPicker(false)} />}
    </div>
  )
}

export default memo(MessageItem)

const MORE_EMOJIS = ['😀', '😁', '🤣', '😊', '😍', '🥰', '😘', '🤔', '🤨', '😐', '🙄', '😏', '😴', '🤯', '🥳', '😭', '😡', '🤬', '💀', '👻', '🤝', '👏', '🙌', '💪', '👋', '✌️', '🤞', '👌', '🫡', '🍕', '⚽', '🎮', '🏆', '⭐', '💔', '💡', '❓', '❗', '🚀', '🍻']

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  return (
    <div className="emoji-picker" ref={ref}>
      {[...QUICK_EMOJIS, ...MORE_EMOJIS].map((e) => (
        <button key={e} onClick={() => onPick(e)}>{e}</button>
      ))}
    </div>
  )
}

function EditBox({ message, onDone }: { message: Message; onDone: () => void }) {
  const [text, setText] = useState(message.content)
  async function save() {
    const content = text.trim()
    if (content === message.content) return onDone()
    if (!content && message.attachments.length === 0) return onDone()
    await supabase.from('messages').update({ content }).eq('id', message.id)
    onDone()
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') onDone()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    }
  }
  return (
    <div className="edit-box">
      <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} autoFocus rows={Math.min(8, text.split('\n').length)} />
      <div className="small muted">
        Çıkmak için <kbd>Esc</kbd>, kaydetmek için <kbd>Enter</kbd>
      </div>
    </div>
  )
}

function AttachmentView({ a }: { a: Attachment }) {
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)
  useEffect(() => {
    let alive = true
    signedUrl(a.path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [a.path])

  useEffect(() => {
    if (!zoom) return
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setZoom(false)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [zoom])

  if (a.type.startsWith('image/')) {
    return (
      <>
        {url ? <img className="attach-image" src={url} alt={a.name} onClick={() => setZoom(true)} loading="lazy" /> : <div className="attach-image placeholder" />}
        {zoom && url && (
          <div className="lightbox" onClick={() => setZoom(false)}>
            <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
              <button className="btn ghost small" onClick={() => setZoom(false)}><Icon name="back" size={16} /> Geri</button>
              <span className="lightbox-name">{a.name}</span>
              <a className="btn ghost small" href={url} target="_blank" rel="noreferrer"><Icon name="download" size={16} /> Orijinali aç</a>
              <button className="icon-btn" onClick={() => setZoom(false)} title="Kapat (Esc)"><Icon name="x" /></button>
            </div>
            <img src={url} alt={a.name} onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </>
    )
  }
  if (a.type.startsWith('video/') && url) return <video className="attach-video" src={url} controls preload="metadata" />
  if (a.type.startsWith('audio/') && url) return <audio src={url} controls preload="metadata" />
  return (
    <div className="attach-file">
      <Icon name="file" size={28} />
      <div className="attach-file-meta">
        {url ? <a href={url} target="_blank" rel="noreferrer">{a.name}</a> : <span>{a.name}</span>}
        <span className="small muted">{formatSize(a.size)}</span>
      </div>
      {url && (
        <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title="İndir"><Icon name="download" /></a>
      )}
    </div>
  )
}
