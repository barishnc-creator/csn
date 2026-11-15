import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../lib/dialog'
import type { ChannelCategory } from '../lib/types'
import Icon from './Icon'

/** Revize #25: kategori oluştur / yeniden adlandır / sil */
export default function CategoryModal({
  kind,
  category,
  onClose,
}: {
  kind: 'text' | 'voice'
  category?: ChannelCategory
  onClose: () => void
}) {
  const { categories, channels } = useApp()
  const [name, setName] = useState(category?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const clean = name.trim()
  const k = category?.kind ?? kind

  async function save() {
    if (!clean || busy) return
    setBusy(true)
    setError(null)
    const { error } = category
      ? await supabase.from('channel_categories').update({ name: clean }).eq('id', category.id)
      : await supabase.from('channel_categories').insert({
          name: clean,
          kind: k,
          position: Math.max(-1, ...categories.filter((c) => c.kind === k).map((c) => c.position)) + 1,
        })
    setBusy(false)
    if (error) return setError(error.message)
    onClose()
  }

  async function remove() {
    if (!category) return
    const n = channels.filter((c) => c.category_id === category.id).length
    const ok = await confirmDialog({
      title: `"${category.name}" kategorisi silinsin mi?`,
      message: n ? `İçindeki ${n} kanal silinmez, kategorisiz kanalların arasına taşınır.` : 'Kategori boş.',
      confirmText: 'Kategoriyi sil',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('channel_categories').delete().eq('id', category.id)
    setBusy(false)
    if (error) return setError(error.message)
    onClose()
  }

  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog create-channel" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="dialog-head">
          <h3>{category ? 'Kategoriyi düzenle' : k === 'voice' ? 'Ses kategorisi oluştur' : 'Metin kategorisi oluştur'}</h3>
          <button type="button" className="close-btn" onClick={onClose} title="Kapat (Esc)">
            <Icon name="x" size={18} />
            <span>ESC</span>
          </button>
        </div>
        <label>
          Kategori adı
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder={k === 'voice' ? 'ör. Oyun odaları' : 'ör. Duyurular'} />
        </label>
        {!category && <div className="muted small">Kategoriyi oluşturduktan sonra başlığındaki + ile içine kanal açabilirsin.</div>}
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions">
          {category && (
            <button type="button" className="btn ghost danger-text" onClick={remove} disabled={busy} style={{ marginRight: 'auto' }}>
              <Icon name="trash" size={15} /> Sil
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button type="submit" className="btn primary" disabled={!clean || busy}>{category ? 'Kaydet' : 'Kategori oluştur'}</button>
        </div>
      </form>
    </div>
  )
}
