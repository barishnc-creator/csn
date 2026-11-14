import { useEffect, useState } from 'react'
import { signedUrl } from '../lib/files'
import { colorFor, initials } from '../lib/format'
import type { Profile, UserStatus } from '../lib/types'

interface Props {
  profile: Profile | null | undefined
  userId: string
  size?: number
  status?: UserStatus | 'offline'
  speaking?: boolean
}

export default function Avatar({ profile, userId, size = 40, status, speaking }: Props) {
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
  return (
    <div
      className={`avatar${speaking ? ' speaking' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: url ? undefined : colorFor(userId) }}
      title={name}
    >
      {url ? <img src={url} alt="" /> : initials(name)}
      {status && <span className={`status-dot ${status}`} style={{ width: size * 0.32, height: size * 0.32 }} />}
    </div>
  )
}
