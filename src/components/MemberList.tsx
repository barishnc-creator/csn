import { useApp } from '../lib/store'
import type { Member } from '../lib/types'
import Avatar from './Avatar'
import Icon from './Icon'
import { MUSIC_BOT_ID } from '../lib/bots'
import { useMusicRows } from '../voice/music'

const baseLabel = { admin: 'Yöneticiler', mod: 'Moderatörler', member: 'Çevrimiçi' } as const

export default function MemberList({ onOpenRevisions }: { onOpenRevisions?: () => void }) {
  const { members, profiles, presence, roles, rolesOf, nameColor, openProfile, openUserMenu, userId, pendingRevisions, isOwner } = useApp()
  const musicRows = useMusicRows()
  const playing = Object.values(musicRows).find((r) => r.current)
  // Müzik botu her zaman çevrimiçi görünür
  const isOn = (uid: string) => uid === MUSIC_BOT_ID || (!!presence[uid] && (presence[uid].status !== 'invisible' || uid === userId))
  const name = (id: string) => profiles[id]?.display_name ?? ''
  const byName = (a: Member, b: Member) => name(a.user_id).localeCompare(name(b.user_id), 'tr')

  const online = members.filter((m) => isOn(m.user_id))
  const offline = members.filter((m) => !isOn(m.user_id)).sort(byName)

  // Gruplama: ayrı gösterilen en üst özel rol → yoksa temel rol
  const groups: { key: string; label: string; color?: string; list: Member[] }[] = []
  const push = (key: string, label: string, m: Member, color?: string) => {
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, label, color, list: [] }))
    g.list.push(m)
  }
  for (const m of online) {
    const hoisted = rolesOf(m.user_id).find((r) => r.hoist)
    if (hoisted) push(hoisted.id, hoisted.name, m, hoisted.color)
    else push(m.role, baseLabel[m.role], m)
  }
  const order = (k: string) => {
    const r = roles.findIndex((x) => x.id === k)
    if (r >= 0) return r
    return 1000 + ['admin', 'mod', 'member'].indexOf(k)
  }
  groups.sort((a, b) => order(a.key) - order(b.key))

  return (
    <aside className="member-list">
      <header className="member-list-head">
        <div className="member-list-title">
          <Icon name="friends" size={16} />
          <span>Sunucu üyeleri</span>
        </div>
        <div className="member-list-stats">
          <span className="stat-pill online"><i /> {online.length} çevrimiçi</span>
          <span className="stat-pill">{members.length} üye</span>
        </div>
        {isOwner && pendingRevisions > 0 && (
          <button className="revision-alert" onClick={onOpenRevisions}>
            <Icon name="bell" size={15} />
            <span><strong>{pendingRevisions}</strong> revize onay bekliyor</span>
            <span className="revision-alert-go">Görüntüle ›</span>
          </button>
        )}
      </header>
      {groups.map((g) => (
        <section key={g.key}>
          <div className="category">{g.label} — {g.list.length}</div>
          {g.list.sort(byName).map((m) => {
            const p = presence[m.user_id] ?? { status: 'online' as const, streaming: false, voice_channel_id: null }
            const isBot = m.user_id === MUSIC_BOT_ID
            return (
              <button key={m.user_id} className="member" onClick={() => openProfile(m.user_id)} onContextMenu={(e) => { e.preventDefault(); openUserMenu(m.user_id, e.clientX, e.clientY) }}>
                <Avatar profile={profiles[m.user_id]} userId={m.user_id} size={32} status={p.status} spinning={isBot && !!playing && !playing.paused} />
                <div className="member-text">
                  <div className="member-name" style={{ color: nameColor(m.user_id) }}>
                    {name(m.user_id) || 'Üye'}
                    {m.is_owner && <Icon name="crown" size={13} className="owner-crown" />}
                    {isBot && <span className="bot-badge">BOT</span>}
                  </div>
                  {isBot ? (
                    <div className="member-sub">{playing?.current ? `🎵 ${playing.current.title}` : profiles[m.user_id]?.custom_status}</div>
                  ) : p.streaming ? (
                    <div className="member-sub live">Yayında</div>
                  ) : p.voice_channel_id ? (
                    <div className="member-sub">Sesli sohbette</div>
                  ) : profiles[m.user_id]?.custom_status ? (
                    <div className="member-sub">{profiles[m.user_id]?.custom_status}</div>
                  ) : null}
                </div>
              </button>
            )
          })}
        </section>
      ))}
      {offline.length > 0 && (
        <section>
          <div className="category">Çevrimdışı — {offline.length}</div>
          {offline.map((m) => (
            <button key={m.user_id} className="member offline" onClick={() => openProfile(m.user_id)} onContextMenu={(e) => { e.preventDefault(); openUserMenu(m.user_id, e.clientX, e.clientY) }}>
              <Avatar profile={profiles[m.user_id]} userId={m.user_id} size={32} status="offline" />
              <div className="member-text">
                <div className="member-name">{name(m.user_id) || 'Üye'}</div>
              </div>
            </button>
          ))}
        </section>
      )}
    </aside>
  )
}
