import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'

/** Tarayıcının eski confirm()/alert() kutuları yerine uygulamaya uygun onay ve bilgi kutuları */

interface DialogRequest {
  kind: 'confirm' | 'alert'
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

type Listener = (r: DialogRequest) => void
let listener: Listener | null = null
const queue: DialogRequest[] = []

function push(r: DialogRequest) {
  if (listener) listener(r)
  else queue.push(r)
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

/** Onay kutusu. Onaylanırsa true döner. */
export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { title: opts } : opts
  return new Promise((resolve) => push({ kind: 'confirm', ...o, resolve }))
}

/** Bilgi / hata kutusu. */
export function alertDialog(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => push({ kind: 'alert', title, message, resolve: () => resolve() }))
}

/** Uygulamanın köküne bir kez konur. */
export function DialogHost() {
  const [items, setItems] = useState<DialogRequest[]>([])
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    listener = (r) => setItems((l) => [...l, r])
    if (queue.length) setItems((l) => [...l, ...queue.splice(0)])
    return () => {
      listener = null
    }
  }, [])

  const cur = items[0]
  const close = (ok: boolean) => {
    if (!cur) return
    cur.resolve(ok)
    setItems((l) => l.slice(1))
  }

  useEffect(() => {
    if (!cur) return
    okRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close(false)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        close(true)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })

  if (!cur) return null
  const danger = cur.danger ?? (cur.kind === 'confirm' && /sil|at[ıi]ls|çıkar|kald[ıi]r/i.test(cur.title + (cur.message ?? '')))
  return (
    <div className="modal-backdrop dim confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className={`dialog confirm-dialog${danger ? ' danger' : ''}`} role="alertdialog" aria-modal="true">
        <div className="confirm-icon">
          <Icon name={cur.kind === 'alert' ? 'info' : danger ? 'trash' : 'help'} size={22} />
        </div>
        <div className="confirm-body">
          <h3>{cur.title}</h3>
          {cur.message && <p>{cur.message}</p>}
        </div>
        <div className="dialog-actions">
          {cur.kind === 'confirm' && (
            <button className="btn ghost" onClick={() => close(false)}>{cur.cancelText ?? 'Vazgeç'}</button>
          )}
          <button ref={okRef} className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
            {cur.confirmText ?? (cur.kind === 'alert' ? 'Tamam' : danger ? 'Sil' : 'Onayla')}
          </button>
        </div>
      </div>
    </div>
  )
}
