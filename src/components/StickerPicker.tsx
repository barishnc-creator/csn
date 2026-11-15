import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { addSticker, deleteSticker, STICKER_MAX_BYTES, STICKER_TYPES, useStickers } from '../lib/stickers'
import { confirmDialog } from '../lib/dialog'
import Icon from './Icon'

/** Revize #15: GIF düğmesinin yanındaki sticker paneli. Yöneticiler ekler/siler. */
export default function StickerPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { userId, myRole } = useApp()
  const admin = myRole === 'admin'
  const { stickers, loaded, urlOf } = useStickers()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.sticker-toggle, .confirm-backdrop')) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    try {
      for (const f of Array.from(files)) await addSticker(userId, f, f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const term = q.trim().toLocaleLowerCase('tr')
  const list = term ? stickers.filter((s) => s.name.toLocaleLowerCase('tr').includes(term)) : stickers

  return (
    <div className="gif-picker sticker-picker" ref={ref}>
      <div className="gif-head">
        <div className="gif-search">
          <Icon name="search" size={16} />
          <input autoFocus placeholder="Sticker ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {admin && (
          <>
            <input ref={fileRef} type="file" hidden multiple accept={STICKER_TYPES.join(',')} onChange={(e) => upload(e.target.files)} />
            <button className="btn small primary" disabled={busy} onClick={() => fileRef.current?.click()} title={`PNG/WEBP/GIF, en fazla ${STICKER_MAX_BYTES / 1024} KB`}>
              <Icon name="plus" size={14} /> {busy ? 'Yükleniyor…' : 'Ekle'}
            </button>
          </>
        )}
        <button className="icon-btn small" onClick={onClose} title="Kapat (Esc)"><Icon name="x" size={16} /></button>
      </div>
      {err && <div className="form-error inline sticker-err">{err}</div>}
      <div className="sticker-grid">
        {list.map((s) => (
          <div key={s.id} className="sticker-cell-wrap">
            <button className="sticker-cell" onClick={() => onPick(s.id)} title={s.name}>
              {urlOf(s.id) ? <img src={urlOf(s.id)!} alt={s.name} loading="lazy" /> : <span className="sticker-loading" />}
            </button>
            {admin && (
              <button
                className="sticker-del"
                title="Stickerı sil"
                onClick={async () => {
                  if (await confirmDialog({ title: `"${s.name}" stickerı silinsin mi?`, message: 'Daha önce gönderilmiş mesajlarda da görünmez olur.', confirmText: 'Sil', danger: true })) {
                    deleteSticker(s).catch((e) => setErr(e.message))
                  }
                }}
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        ))}
        {loaded && list.length === 0 && (
          <div className="sticker-empty">
            <Icon name="sticker" size={36} />
            <p>{term ? 'Bulunamadı.' : admin ? 'Henüz sticker yok. "Ekle" ile sunucunun temasına uygun stickerlar yükle.' : 'Henüz sticker yok. Sunucu yöneticileri ekleyebilir.'}</p>
          </div>
        )}
      </div>
      <div className="gif-foot">{stickers.length} sunucu stickerı{admin ? ' · yöneticiler ekleyip silebilir' : ''}</div>
    </div>
  )
}
