import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'

/** Sahibe özel: herkesin uygulamasını yenile */
export default function ReloadDialog({ onClose }: { onClose: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function send() {
    setBusy(true)
    const { error } = await supabase.rpc('broadcast_reload', { note: note.trim() || null })
    setBusy(false)
    if (error) setError(error.message)
    else onClose()
  }
  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-head">
          <h3>Herkesi yenile</h3>
          <button className="icon-btn" onClick={onClose} title="Kapat"><Icon name="x" /></button>
        </div>
        <p className="muted">Cousy'yi açık tutan herkesin ekranı 5 saniye içinde yenilenir ve yeni sürüm yüklenir. Sesli sohbette olanların bağlantısı koparılmaz; onlara bir uyarı gösterilir.</p>
        <label>
          Kısa not (isteğe bağlı)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="ör. Emoji tepkileri geldi!" autoFocus />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" onClick={send} disabled={busy}><Icon name="refresh" size={16} /> Yenile</button>
        </div>
      </div>
    </div>
  )
}
