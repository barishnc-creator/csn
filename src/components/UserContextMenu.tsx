import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { formatTag } from '../lib/format'
import { acceptFriend, sendFriendRequest } from '../lib/friends'
import { useVoice } from '../voice/VoiceContext'
import Icon from './Icon'

/** Kullanıcıya sağ tıklayınca açılan menü: profil, mesaj, arkadaşlık, ses seviyesi, hızlı rol verme (yönetici) */
export default function UserContextMenu() {
  const { userMenu, openUserMenu, profiles, userId, myRole, roles, memberRoles, members, openProfile, openDm, friendState, presence } = useApp()
  const voice = useVoice()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const [error, setError] = useState<string | null>(null)

  const uid = userMenu?.uid
  const close = () => openUserMenu(null)

  useEffect(() => {
    if (!userMenu) return
    setError(null)
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', close)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMenu])

  // Ekran dışına taşmasın
  useLayoutEffect(() => {
    if (!userMenu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(userMenu.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(userMenu.y, window.innerHeight - r.height - 8)),
    })
  }, [userMenu, roles.length])

  if (!userMenu || !uid) return null
  const p = profiles[uid]
  const isMe = uid === userId
  const isAdmin = myRole === 'admin'
  const isMember = members.some((m) => m.user_id === uid)
  const fs = friendState(uid)
  const inMyCall = !isMe && !!voice.channelId && presence[uid]?.voice_channel_id === voice.channelId
  const volume = voice.settings.volumes[uid] ?? 1
  const has = (rid: string) => memberRoles.some((m) => m.user_id === uid && m.role_id === rid)

  async function toggleRole(rid: string) {
    setError(null)
    const { error } = has(rid)
      ? await supabase.from('member_roles').delete().match({ user_id: uid, role_id: rid })
      : await supabase.from('member_roles').insert({ user_id: uid, role_id: rid })
    if (error) setError(error.message)
  }

  return (
    <div ref={ref} className="context-menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      <div className="context-head">
        <strong>{p?.display_name ?? 'Üye'}</strong>
        <span className="muted small">{formatTag(p?.tag)}</span>
      </div>
      <button onClick={() => { close(); openProfile(uid) }}><Icon name="users" size={16} /> Profil</button>
      {!isMe && isMember && (
        <button onClick={() => { close(); openDm(uid) }}><Icon name="message" size={16} /> Mesaj gönder</button>
      )}
      {!isMe && isMember && fs.state === 'none' && (
        <button onClick={() => sendFriendRequest(uid).then(close).catch((e) => setError(e.message))}><Icon name="userPlus" size={16} /> Arkadaş ekle</button>
      )}
      {!isMe && fs.state === 'incoming' && fs.id && (
        <button onClick={() => acceptFriend(fs.id!).then(close)}><Icon name="check" size={16} /> İsteği kabul et</button>
      )}
      <button onClick={() => { navigator.clipboard?.writeText(`${p?.display_name ?? ''}${formatTag(p?.tag)}`); close() }}>
        <Icon name="hash" size={16} /> Adı ve etiketi kopyala
      </button>

      {inMyCall && (
        <>
          <div className="context-sep" />
          <div className="context-label">Kullanıcı ses seviyesi · %{Math.round(volume * 100)}</div>
          <input className="context-range" type="range" min={0} max={2} step={0.05} value={volume} onChange={(e) => voice.setVolume(uid, Number(e.target.value))} />
        </>
      )}

      {isAdmin && isMember && (
        <>
          <div className="context-sep" />
          <div className="context-label">Roller</div>
          {roles.length === 0 && <div className="muted small context-pad">Henüz rol yok. Ayarlar → Roller'den oluştur.</div>}
          <div className="context-roles">
            {roles.map((r) => (
              <button key={r.id} className={`context-role${has(r.id) ? ' on' : ''}`} onClick={() => toggleRole(r.id)}>
                <span className="context-check" style={{ ['--role' as string]: r.color }}>{has(r.id) && <Icon name="check" size={12} />}</span>
                <span className="role-dot" style={{ background: r.color }} />
                <span className="context-role-name">{r.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {error && <div className="form-error context-pad">{error}</div>}
    </div>
  )
}
