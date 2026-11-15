import { useEffect, useState } from 'react'
import { signedUrl } from '../lib/files'
import { colorFor, initials } from '../lib/format'
import type { Profile, UserStatus } from '../lib/types'
import { MUSIC_BOT_ID } from '../lib/bots'

interface Props {
  profile: Profile | null | undefined
  userId: string
  size?: number
  status?: UserStatus | 'offline'
  speaking?: boolean
  /** Müzik botu: plak dönsün */
  spinning?: boolean
}

/** Müzik botunun profil fotoğrafı: plak */
export function Vinyl({ size, spinning }: { size: number; spinning?: boolean }) {
  return (
    <svg className={`vinyl${spinning ? ' spinning' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="vinyl-shine" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#3a3d4a" />
          <stop offset="0.55" stopColor="#15161c" />
          <stop offset="1" stopColor="#0b0b0f" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#vinyl-shine)" />
      {[27, 23.5, 20, 16.5].map((r) => (
        <circle key={r} cx="32" cy="32" r={r} fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="0.8" />
      ))}
      <path d="M14 18 A22 22 0 0 1 30 10" stroke="#fff" strokeOpacity="0.22" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="32" r="11" fill="#1db954" />
      <circle cx="32" cy="32" r="11" fill="none" stroke="#000" strokeOpacity="0.25" />
      <path d="M29 27.5v8.2a2.4 2.4 0 1 0 1.6 2.3v-7.6l5-1.2v4.9a2.4 2.4 0 1 0 1.6 2.3V26z" fill="#0b2a17" opacity="0.85" />
      <circle cx="32" cy="32" r="1.6" fill="#0b0b0f" />
    </svg>
  )
}

export default function Avatar({ profile, userId, size = 40, status, speaking, spinning }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const path = profile?.avatar_path
  useEffect(() => {
    let alive = true
    if (!path) {
      setUrl(null)
      return
    }
    signedUrl(path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [path])

  const name = profile?.display_name ?? '?'
  if (userId === MUSIC_BOT_ID && !url) {
    return (
      <div className={`avatar vinyl-avatar${speaking ? ' speaking' : ''}`} style={{ width: size, height: size }} title={name}>
        <Vinyl size={size} spinning={spinning} />
        {status && <span className={`status-dot ${status === 'invisible' ? 'offline' : status}`} style={{ width: size * 0.32, height: size * 0.32 }} />}
      </div>
    )
  }
  return (
    <div
      className={`avatar${speaking ? ' speaking' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: url ? undefined : colorFor(userId) }}
      title={name}
    >
      {url ? <img src={url} alt="" /> : initials(name)}
      {status && <span className={`status-dot ${status === 'invisible' ? 'offline' : status}`} style={{ width: size * 0.32, height: size * 0.32 }} />}
    </div>
  )
}
