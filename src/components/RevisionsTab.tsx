import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { formatStamp } from '../lib/format'
import type { Revision, RevisionStatus } from '../lib/types'
import Avatar from './Avatar'
import Icon from './Icon'

const statusLabel: Record<RevisionStatus, string> = {
  pending: 'Onay bekliyor',
  approved: 'Onaylandı, sırada',
  rejected: 'Reddedildi',
  in_progress: 'Yapılıyor',
  done: 'Tamamlandı',
}

type Filter = 'open' | 'all' | RevisionStatus
const filters: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Açık' },
  { id: 'pending', label: 'Onay bekleyen' },
  { id: 'approved', label: 'Sırada' },
  { id: 'done', label: 'Tamamlanan' },
  { id: 'rejected', label: 'Reddedilen' },
  { id: 'all', label: 'Tümü' },
]

export default function RevisionsTab() {
  const { isOwner, userId, profiles } = useApp()
  const [items, setItems] = useState<Revision[]>([])
  const [filter, setFilter] = useState<Filter>('open')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('revisions').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setItems((data ?? []) as Revision[])
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('csn-revisions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revisions' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  async function create() {
    if (title.trim().length < 3) return setError('Başlık en az 3 karakter olmalı')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('revisions').insert({ title: title.trim(), description: description.trim() })
    setBusy(false)
    if (error) return setError(error.message)
    setTitle('')
    setDescription('')
    load()
  }

  const shown = items.filter((r) =>
    filter === 'all' ? true : filter === 'open' ? ['pending', 'approved', 'in_progress'].includes(r.status) : r.status === filter,
  )
  const pendingCount = items.filter((r) => r.status === 'pending').length

  return (
    <div className="settings-page">
      <p className="muted">
        CSN'de değişmesini ya da eklenmesini istediğin şeyleri buraya yaz. Bu alanı yalnız yöneticiler görür.
        Bir revize ancak sunucu sahibi onaylayınca yapılmaya başlanır.
      </p>

      {isOwner && pendingCount > 0 && (
        <div className="notice">
          <Icon name="edit" size={16} /> Onayını bekleyen <strong>{pendingCount}</strong> revize var.
        </div>
      )}

      <div className="revision-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kısa başlık (ör. Mesajlara emoji tepkisi eklensin)" maxLength={120} />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ayrıntı: ne istiyorsun, nerede, nasıl görünmeli? (isteğe bağlı)"
          rows={3}
          maxLength={4000}
        />
        <div className="row">
          <button className="btn primary" onClick={create} disabled={busy || title.trim().length < 3}>
            Revize gönder
          </button>
          {error && <span className="form-error inline">{error}</span>}
        </div>
      </div>

      <div className="filter-tabs">
        {filters.map((f) => (
          <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
            {f.label}
            {f.id === 'pending' && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="muted">Bu listede revize yok.</p>}
      {shown.map((r) => (
        <RevisionCard
          key={r.id}
          r={r}
          isOwner={isOwner}
          isMine={r.created_by === userId}
          authorName={profiles[r.created_by]?.display_name ?? 'Eski üye'}
          deciderName={r.decided_by ? profiles[r.decided_by]?.display_name ?? '' : ''}
          onChanged={load}
          onError={setError}
        />
      ))}
    </div>
  )
}

interface CardProps {
  r: Revision
  isOwner: boolean
  isMine: boolean
  authorName: string
  deciderName: string
  onChanged: () => void
  onError: (e: string) => void
}

function RevisionCard({ r, isOwner, isMine, authorName, deciderName, onChanged, onError }: CardProps) {
  const { profiles } = useApp()
  const [note, setNote] = useState(r.owner_note ?? '')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(r.title)
  const [description, setDescription] = useState(r.description)

  async function update(patch: Partial<Revision>) {
    const { error } = await supabase.from('revisions').update(patch).eq('id', r.id)
    if (error) onError(error.message)
    else onChanged()
  }

  async function remove() {
    if (!confirm(`"${r.title}" revizesi silinsin mi?`)) return
    const { error } = await supabase.from('revisions').delete().eq('id', r.id)
    if (error) onError(error.message)
    else onChanged()
  }

  const canEditText = isMine && r.status === 'pending'
  const canDelete = isOwner || (isMine && r.status === 'pending')

  return (
    <div className={`revision-card status-${r.status}`}>
      <div className="revision-head">
        <span className={`status-pill ${r.status}`}>{statusLabel[r.status]}</span>
        <span className="muted small">#{r.id}</span>
        <div className="revision-head-actions">
          {canEditText && !editing && (
            <button className="icon-btn small" onClick={() => setEditing(true)} title="Düzenle"><Icon name="edit" size={14} /></button>
          )}
          {canDelete && (
            <button className="icon-btn small danger" onClick={remove} title="Sil"><Icon name="trash" size={14} /></button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="revision-form">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} />
          <div className="row">
            <button className="btn primary small" onClick={() => { update({ title: title.trim(), description: description.trim() }); setEditing(false) }}>Kaydet</button>
            <button className="btn small" onClick={() => { setEditing(false); setTitle(r.title); setDescription(r.description) }}>Vazgeç</button>
          </div>
        </div>
      ) : (
        <>
          <div className="revision-title">{r.title}</div>
          {r.description && <div className="revision-desc">{r.description}</div>}
        </>
      )}

      <div className="revision-meta">
        <Avatar profile={profiles[r.created_by]} userId={r.created_by} size={18} />
        <span>{authorName}</span>
        <span className="muted">· {formatStamp(r.created_at)}</span>
        {r.decided_at && (
          <span className="muted">· {r.status === 'rejected' ? 'Reddeden' : 'Onaylayan'}: {deciderName} ({formatStamp(r.decided_at)})</span>
        )}
      </div>

      {r.owner_note && !isOwner && <div className="revision-note"><strong>Sahibin notu:</strong> {r.owner_note}</div>}
      {r.dev_note && <div className="revision-note dev"><strong>Geliştirici notu:</strong> {r.dev_note}</div>}

      {isOwner && (
        <div className="revision-owner">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not ekle (isteğe bağlı)" maxLength={1000} />
          {r.status === 'pending' && (
            <>
              <button className="btn primary small" onClick={() => update({ status: 'approved', owner_note: note.trim() || null })}>Onayla</button>
              <button className="btn danger small" onClick={() => update({ status: 'rejected', owner_note: note.trim() || null })}>Reddet</button>
            </>
          )}
          {(r.status === 'approved' || r.status === 'rejected') && (
            <button className="btn small" onClick={() => update({ status: 'pending', owner_note: note.trim() || null })}>Kararı geri al</button>
          )}
          {r.status !== 'pending' && note !== (r.owner_note ?? '') && (
            <button className="btn small" onClick={() => update({ owner_note: note.trim() || null })}>Notu kaydet</button>
          )}
        </div>
      )}
    </div>
  )
}
