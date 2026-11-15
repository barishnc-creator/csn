import { useEffect, useMemo, useRef, useState } from 'react'
import gifs from '../lib/gifs.json'
import Icon from './Icon'

export interface GifItem {
  id: string
  cat: string
  title: string
}

const CATS: { id: string; label: string; emoji: string }[] = [
  { id: 'populer', label: 'Popüler', emoji: '🔥' },
  { id: 'kahkaha', label: 'Kahkaha', emoji: '😂' },
  { id: 'evet', label: 'Evet', emoji: '👍' },
  { id: 'hayir', label: 'Hayır', emoji: '🙅' },
  { id: 'sok', label: 'Şok', emoji: '😱' },
  { id: 'uzgun', label: 'Üzgün', emoji: '😢' },
  { id: 'sinirli', label: 'Sinirli', emoji: '😡' },
  { id: 'ask', label: 'Aşk', emoji: '❤️' },
  { id: 'dans', label: 'Dans', emoji: '💃' },
  { id: 'alkis', label: 'Alkış', emoji: '👏' },
  { id: 'selam', label: 'Selam', emoji: '👋' },
  { id: 'tesekkur', label: 'Teşekkür', emoji: '🙏' },
  { id: 'oyun', label: 'Oyun', emoji: '🎮' },
  { id: 'uyku', label: 'Uyku', emoji: '😴' },
  { id: 'facepalm', label: 'Facepalm', emoji: '🤦' },
  { id: 'dusunceli', label: 'Düşünceli', emoji: '🤔' },
]

const RECENT_KEY = 'csn.gifs.recent'

/** Gönderilecek tam GIF adresi (mesaj içeriği olarak gider) */
export const gifUrl = (id: string) => `https://media.giphy.com/media/${id}/giphy.gif`
const previewUrl = (id: string) => `https://media.giphy.com/media/${id}/200w.webp`

/** Mesaj yalnız bir GIPHY/Tenor GIF adresinden mi oluşuyor */
export function isGifMessage(content: string) {
  return /^https:\/\/(media\d?\.giphy\.com\/media\/[A-Za-z0-9]+\/[\w.-]+|media\.tenor\.com\/\S+\.gif)$/.test(content.trim())
}

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

export default function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const all = gifs as GifItem[]
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [cat, setCat] = useState<string>(() => (readRecent().length ? 'son' : 'populer'))
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.gif-toggle')) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr')
    if (term) {
      const catHit = CATS.filter((c) => c.label.toLocaleLowerCase('tr').includes(term)).map((c) => c.id)
      return all.filter((g) => g.title.toLowerCase().includes(term) || catHit.includes(g.cat))
    }
    if (cat === 'son') return recent.map((id) => all.find((g) => g.id === id) ?? { id, cat: 'son', title: '' })
    return all.filter((g) => g.cat === cat)
  }, [all, cat, q, recent])

  function pick(id: string) {
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, 24)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      // yoksay
    }
    onPick(gifUrl(id))
  }

  return (
    <div className="gif-picker" ref={ref}>
      <div className="gif-head">
        <div className="gif-search">
          <Icon name="search" size={16} />
          <input autoFocus placeholder={`${all.length} GIF içinde ara… (ör. dans, lol, yes)`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="icon-btn small" onClick={onClose} title="Kapat (Esc)"><Icon name="x" size={16} /></button>
      </div>
      {!q && (
        <div className="gif-cats">
          {recent.length > 0 && (
            <button className={cat === 'son' ? 'active' : ''} onClick={() => setCat('son')}>🕘 Son</button>
          )}
          {CATS.filter((c) => all.some((g) => g.cat === c.id)).map((c) => (
            <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="gif-grid">
        {list.map((g) => (
          <button key={g.id} className="gif-cell" onClick={() => pick(g.id)} title={g.title}>
            <img src={previewUrl(g.id)} alt={g.title} loading="lazy" />
          </button>
        ))}
        {list.length === 0 && <p className="muted small gif-empty">Bulunamadı. Başka bir kelime dene.</p>}
      </div>
      <div className="gif-foot">GIPHY</div>
    </div>
  )
}
