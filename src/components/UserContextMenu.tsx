import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { formatTag } from '../lib/format'
import { acceptFriend, sendFriendRequest } from '../lib/friends'
import { useVoice } from '../voice/VoiceContext'
import { music, useMusic } from '../voice/music'
import { MUSIC_BOT_ID, isBot } from '../lib/bots'
import Icon from './Icon'
import { STATUS_OPTIONS, statusLabel } from '../lib/status'

/** Kullanıcıya sağ tıklayınca açılan menü: profil, mesaj, arkadaşlık, ses seviyesi, hızlı rol verme (yönetici) */
export default function UserContextMenu() {
  const { userMenu, openUserMenu, profiles, userId, myRole, roles, memberRoles, members, openProfile, openDm, friendState, presence, myChosenStatus, setMyStatus, can, channels } = useApp()
  const voice = useVoice()
  const musicSnap = useMusic()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const [error, setError] = useState<string | null>(null)
  const [sub, setSub] = useState<'roles' | 'status' | 'move' | null>(null)
  const [subPos, setSubPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const [roleQuery, setRoleQuery] = useState('')
  const rolesItem = useRef<HTMLButtonElement>(null)
  const statusItem = useRef<HTMLButtonElement>(null)
  const moveItem = useRef<HTMLButtonElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)

  function cancelCloseSub() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  function scheduleCloseSub() {
    cancelCloseSub()
    closeTimer.current = window.setTimeout(() => setSub(null), 220)
  }
  function openSub(kind: 'roles' | 'status' | 'move' = 'roles') {
    cancelCloseSub()
    setSub(kind)
  }

  const uid = userMenu?.uid
  const close = () => openUserMenu(null)

  useEffect(() => {
    setSub(null)
    setRoleQuery('')
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

  // Alt paneli "Roller" satırının yanına yerleştir (sağa sığmazsa sola)
  useLayoutEffect(() => {
    const trigger = sub === 'status' ? statusItem.current : sub === 'move' ? moveItem.current : rolesItem.current
    if (!sub || !trigger || !subRef.current || !ref.current) return
    const menu = ref.current.getBoundingClientRect()
    const item = trigger.getBoundingClientRect()
    const subRect = subRef.current.getBoundingClientRect()
    const right = menu.right + 6
    const left = right + subRect.width > window.innerWidth - 8 ? menu.left - subRect.width - 6 : right
    const top = Math.max(8, Math.min(item.top - 8, window.innerHeight - subRect.height - 8))
    setSubPos({ left, top })
  }, [sub, roles.length, roleQuery])

  if (!userMenu || !uid) return null
  const p = profiles[uid]
  const isMe = uid === userId
  const isAdmin = myRole === 'admin'
  const isMember = members.some((m) => m.user_id === uid)
  const bot = isBot(uid)
  const fs = friendState(uid)
  const inMyCall = !isMe && !!voice.channelId && presence[uid]?.voice_channel_id === voice.channelId
  const volume = voice.settings.volumes[uid] ?? 1
  // Revize #26: ses kanalındaki birini başka odaya taşı (yetki: move_members)
  const voiceChannels = channels.filter((c) => c.kind === 'voice')
  const targetVoice = presence[uid]?.voice_channel_id
  const canMove = !isMe && !bot && isMember && can('move_members') && voiceChannels.some((c) => c.id === targetVoice)
  async function moveTo(channelId: string) {
    setError(null)
    const { error } = await supabase.from('voice_moves').insert({ target: uid, channel_id: channelId, moved_by: userId })
    if (error) setError(error.message)
    else close()
  }
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
      {isMe && (
        <>
          <button
            ref={statusItem}
            className={`context-sub-trigger${sub === 'status' ? ' open' : ''}`}
            onMouseEnter={() => openSub('status')}
            onMouseLeave={scheduleCloseSub}
            onClick={() => openSub('status')}
          >
            <span className={`status-dot static ${myChosenStatus === 'invisible' ? 'offline' : myChosenStatus}`} />
            <span className="context-role-name">Durum: {statusLabel(myChosenStatus)}</span>
            <span className="context-sub-arrow">›</span>
          </button>
          {sub === 'status' && (
            <div ref={subRef} className="context-menu context-submenu" style={subPos} onMouseEnter={cancelCloseSub} onMouseLeave={scheduleCloseSub}>
              <div className="context-label">Durumunu seç</div>
              {STATUS_OPTIONS.map((o) => (
                <button key={o.id} className={`status-option${myChosenStatus === o.id ? ' on' : ''}`} onClick={() => { setMyStatus(o.id); close() }}>
                  <span className={`status-dot static ${o.id === 'invisible' ? 'offline' : o.id}`} />
                  <span className="status-option-text">
                    <strong>{o.label}</strong>
                    <span className="muted small">{o.hint}</span>
                  </span>
                  {myChosenStatus === o.id && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          )}
          <div className="context-sep" />
        </>
      )}
      <button onClick={() => { close(); openProfile(uid) }}><Icon name="users" size={16} /> Profil</button>
      {!isMe && isMember && !bot && (
        <button onClick={() => { close(); openDm(uid) }}><Icon name="message" size={16} /> Mesaj gönder</button>
      )}
      {!isMe && isMember && !bot && fs.state === 'none' && (
        <button onClick={() => sendFriendRequest(uid).then(close).catch((e) => setError(e.message))}><Icon name="userPlus" size={16} /> Arkadaş ekle</button>
      )}
      {!isMe && fs.state === 'incoming' && fs.id && (
        <button onClick={() => acceptFriend(fs.id!).then(close)}><Icon name="check" size={16} /> İsteği kabul et</button>
      )}
      <button onClick={() => { navigator.clipboard?.writeText(`${p?.display_name ?? ''}${formatTag(p?.tag)}`); close() }}>
        <Icon name="hash" size={16} /> Adı ve etiketi kopyala
      </button>

      {uid === MUSIC_BOT_ID && (
        <>
          <div className="context-sep" />
          <div className="context-label">Müzik ses seviyesi · %{musicSnap.volume}</div>
          <input className="context-range" type="range" min={0} max={100} step={1} value={musicSnap.volume} onChange={(e) => music.setVolume(Number(e.target.value))} />
          <div className="muted small context-pad">Yalnız senin duyduğun sesi değiştirir.</div>
        </>
      )}

      {inMyCall && !bot && (
        <>
          <div className="context-sep" />
          <div className="context-label">Kullanıcı ses seviyesi · %{Math.round(volume * 100)}</div>
          <input className="context-range" type="range" min={0} max={2} step={0.05} value={volume} onChange={(e) => voice.setVolume(uid, Number(e.target.value))} />
        </>
      )}

      {canMove && (
        <>
          <div className="context-sep" />
          <button
            ref={moveItem}
            className={`context-sub-trigger${sub === 'move' ? ' open' : ''}`}
            onMouseEnter={() => openSub('move')}
            onMouseLeave={scheduleCloseSub}
            onClick={() => openSub('move')}
          >
            <Icon name="speaker" size={16} />
            <span className="context-role-name">Taşı</span>
            <span className="context-sub-arrow">›</span>
          </button>
          {sub === 'move' && (
            <div ref={subRef} className="context-menu context-submenu" style={subPos} onMouseEnter={cancelCloseSub} onMouseLeave={scheduleCloseSub}>
              <div className="context-label">Ses odasına taşı</div>
              {voiceChannels.map((c) => {
                const n = Object.values(presence).filter((x) => x.voice_channel_id === c.id).length
                const here = c.id === targetVoice
                return (
                  <button key={c.id} className="context-move" disabled={here} onClick={() => moveTo(c.id)}>
                    <Icon name="speaker" size={14} />
                    <span className="context-role-name">{c.name}</span>
                    <span className="muted small">{here ? 'şu an burada' : c.user_limit ? `${n}/${c.user_limit}` : n || ''}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {isAdmin && isMember && (
        <>
          <div className="context-sep" />
          <button
            ref={rolesItem}
            className={`context-sub-trigger${sub === 'roles' ? ' open' : ''}`}
            onMouseEnter={() => openSub('roles')}
            onMouseLeave={scheduleCloseSub}
            onClick={() => openSub('roles')}
          >
            <Icon name="shield" size={16} />
            <span className="context-role-name">Roller</span>
            <span className="context-sub-dots">
              {roles.filter((r) => has(r.id)).slice(0, 4).map((r) => (
                <i key={r.id} style={{ background: r.color }} />
              ))}
            </span>
            <span className="context-sub-arrow">›</span>
          </button>
          {sub === 'roles' && (
            <div
              ref={subRef}
              className="context-menu context-submenu"
              style={subPos}
              onMouseEnter={cancelCloseSub}
              onMouseLeave={scheduleCloseSub}
            >
              <div className="context-label">Rolleri seç</div>
              {roles.length === 0 && <div className="muted small context-pad">Henüz rol yok. Ayarlar → Roller'den oluştur.</div>}
              {roles.length > 8 && (
                <input className="context-search" placeholder="Rol ara…" value={roleQuery} onChange={(e) => setRoleQuery(e.target.value)} autoFocus />
              )}
              <div className="context-roles">
                {roles
                  .filter((r) => r.name.toLocaleLowerCase('tr').includes(roleQuery.toLocaleLowerCase('tr')))
                  .map((r) => (
                    <button key={r.id} className={`context-role${has(r.id) ? ' on' : ''}`} onClick={() => toggleRole(r.id)}>
                      <span className="context-check" style={{ ['--role' as string]: r.color }}>{has(r.id) && <Icon name="check" size={12} />}</span>
                      <span className="role-dot" style={{ background: r.color }} />
                      <span className="context-role-name">{r.name}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
      {error && <div className="form-error context-pad">{error}</div>}
    </div>
  )
}
