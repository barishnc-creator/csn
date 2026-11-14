import { memo, useEffect, useState, type KeyboardEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { formatStamp, formatTime } from '../lib/format'
import { formatSize, signedUrl } from '../lib/files'
import { mentionsMe, renderMarkdown } from '../lib/markdown'
import type { Attachment, Message } from '../lib/types'
import Avatar from './Avatar'
import Icon from './Icon'

interface Props {
  message: Message
  grouped: boolean
  replied: Message | null
  editing: boolean
  canDelete: boolean
  onReply: () => void
  onEdit: () => void
  onEditDone: () => void
}

function MessageItem({ message: m, grouped, replied, editing, canDelete, onReply, onEdit, onEditDone }: Props) {
  const { profiles, userId, me } = useApp()
  const author = profiles[m.author_id]
  const names = Object.values(profiles).map((p) => p.display_name)
  const mine = m.author_id === userId
  const highlighted = !mine && mentionsMe(m.content, me?.display_name)

  async function remove() {
    if (!confirm('Bu mesaj silinsin mi?')) return
    await supabase.from('messages').delete().eq('id', m.id)
  }

  return (
    <div className={`message${grouped ? ' grouped' : ''}${highlighted ? ' mentioned' : ''}`}>
      {replied !== null || m.reply_to ? (
        <div className="reply-ref">
          <span className="reply-line" />
          {replied ? (
            <>
              <Avatar profile={profiles[replied.author_id]} userId={replied.author_id} size={16} />
              <strong>{profiles[replied.author_id]?.display_name ?? 'Üye'}</strong>
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
            <Avatar profile={author} userId={m.author_id} size={40} />
          )}
        </div>
        <div className="message-body">
          {!grouped && (
            <div className="message-head">
              <span className="author">{author?.display_name ?? 'Eski üye'}</span>
              <span className="stamp">{formatStamp(m.created_at)}</span>
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
        </div>
      </div>
      {!editing && (
        <div className="message-actions">
          <button onClick={onReply} title="Yanıtla"><Icon name="reply" size={18} /></button>
          {mine && <button onClick={onEdit} title="Düzenle"><Icon name="edit" size={18} /></button>}
          {canDelete && <button className="danger" onClick={remove} title="Sil"><Icon name="trash" size={18} /></button>}
        </div>
      )}
    </div>
  )
}

export default memo(MessageItem)

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

  if (a.type.startsWith('image/')) {
    return (
      <>
        {url ? <img className="attach-image" src={url} alt={a.name} onClick={() => setZoom(true)} loading="lazy" /> : <div className="attach-image placeholder" />}
        {zoom && url && (
          <div className="lightbox" onClick={() => setZoom(false)}>
            <img src={url} alt={a.name} />
            <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Orijinali aç</a>
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
