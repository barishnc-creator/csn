import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { ChannelKind } from '../lib/types'
import Icon from './Icon'

/** Revize #19: kategori başlığındaki "+" ile hızlı kanal oluşturma */
export default function CreateChannelModal({
  kind: initialKind,
  categoryId: initialCategory = null,
  onClose,
  onCreated,
}: {
  kind: ChannelKind
  categoryId?: string | null
  onClose: () => void
  onCreated: (id: string, kind: ChannelKind) => void
}) {
  const { channels, categories } = useApp()
  const [kind, setKind] = useState<ChannelKind>(initialKind)
  const [categoryId, setCategoryId] = useState<string | null>(initialCategory)
  const kindCategories = categories.filter((c) => c.kind === kind)
  // Tür değişince seçili kategori o türe ait değilse kategorisiz yap
  const catId = kindCategories.some((c) => c.id === categoryId) ? categoryId : null
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const clean = kind === 'text' ? name.trim().toLocaleLowerCase('tr').replace(/\s+/g, '-') : name.trim()

  async function create() {
    if (!clean || busy) return
    setBusy(true)
    setError(null)
    const position = Math.max(-1, ...channels.filter((c) => c.kind === kind && c.category_id === catId).map((c) => c.position)) + 1
    // insert sonrası .select() kullanılmaz (bkz. 0010); yeni satır ayrıca okunur
    const { error } = await supabase.from('channels').insert({ name: clean, kind, position, category_id: catId })
    if (error) {
      setBusy(false)
      return setError(error.message)
    }
    const { data } = await supabase
      .from('channels')
      .select('id')
      .eq('name', clean)
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setBusy(false)
    if (data) onCreated(data.id, kind)
    onClose()
  }

  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog create-channel" onSubmit={(e) => { e.preventDefault(); create() }}>
        <div className="dialog-head">
          <h3>Kanal oluştur</h3>
          <button type="button" className="close-btn" onClick={onClose} title="Kapat (Esc)">
            <Icon name="x" size={18} />
            <span>ESC</span>
          </button>
        </div>
        <div className="kind-picker">
          {(['text', 'voice'] as const).map((k) => (
            <button type="button" key={k} className={`kind-option${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>
              <Icon name={k === 'text' ? 'hash' : 'speaker'} size={22} />
              <span>
                <strong>{k === 'text' ? 'Metin' : 'Ses'}</strong>
                <small>{k === 'text' ? 'Mesaj, resim, GIF ve sticker gönder' : 'Sesli konuş, kamera ve ekran paylaş'}</small>
              </span>
              <span className="kind-radio" />
            </button>
          ))}
        </div>
        <label>
          Kanal adı
          <div className="input-with-icon">
            <Icon name={kind === 'text' ? 'hash' : 'speaker'} size={16} />
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={kind === 'text' ? 'yeni-kanal' : 'Sohbet odası'} />
          </div>
        </label>
        {kindCategories.length > 0 && (
          <label>
            Kategori
            <select value={catId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
              <option value="">{kind === 'text' ? 'Metin kanalları (kategorisiz)' : 'Ses kanalları (kategorisiz)'}</option>
              {kindCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button type="submit" className="btn primary" disabled={!clean || busy}>{busy ? 'Oluşturuluyor…' : 'Kanal oluştur'}</button>
        </div>
      </form>
    </div>
  )
}
