import { useApp } from '../lib/store'
import type { Member } from '../lib/types'
import Avatar from './Avatar'
import Icon from './Icon'

const baseLabel = { admin: 'Yöneticiler', mod: 'Moderatörler', member: 'Çevrimiçi' } as const

export default function MemberList() {
  const { members, profiles, presence, roles, rolesOf, nameColor, openProfile, openUserMenu, userId } = useApp()
  const isOn = (uid: string) => !!presence[uid] && (presence[uid].status !== 'invisible' || uid === userId)
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
      {groups.map((g) => (
        <section key={g.key}>
          <div className="category">{g.label} — {g.list.length}</div>
          {g.list.sort(byName).map((m) => {
            const p = presence[m.user_id]
            return (
              <button key={m.user_id} className="member" onClick={() => openProfile(m.user_id)} onContextMenu={(e) => { e.preventDefault(); openUserMenu(m.user_id, e.clientX, e.clientY) }}>
                <Avatar profile={profiles[m.user_id]} userId={m.user_id} size={32} status={p.status} />
                <div className="member-text">
                  <div className="member-name" style={{ color: nameColor(m.user_id) }}>
                    {name(m.user_id) || 'Üye'}
                    {m.is_owner && <Icon name="crown" size={13} className="owner-crown" />}
                  </div>
                  {p.streaming ? (
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
