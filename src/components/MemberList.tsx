import { useApp } from '../lib/store'
import type { Role } from '../lib/types'
import Avatar from './Avatar'

const roleLabel: Record<Role, string> = { admin: 'Yönetici', mod: 'Moderatör', member: 'Üyeler' }
const order: Role[] = ['admin', 'mod', 'member']

export default function MemberList() {
  const { members, profiles, presence } = useApp()
  const online = members.filter((m) => presence[m.user_id])
  const offline = members.filter((m) => !presence[m.user_id])
  const name = (id: string) => profiles[id]?.display_name ?? ''
  const byName = (a: { user_id: string }, b: { user_id: string }) => name(a.user_id).localeCompare(name(b.user_id), 'tr')

  return (
    <aside className="member-list">
      {order.map((role) => {
        const group = online.filter((m) => m.role === role).sort(byName)
        if (!group.length) return null
        return (
          <section key={role}>
            <div className="category">{roleLabel[role]} — {group.length}</div>
            {group.map((m) => {
              const p = presence[m.user_id]
              return (
                <div key={m.user_id} className={`member role-${m.role}`}>
                  <Avatar profile={profiles[m.user_id]} userId={m.user_id} size={32} status={p.status} />
                  <div className="member-text">
                    <div className="member-name">{name(m.user_id) || 'Üye'}{m.is_owner && <span className="owner-tag">SAHİP</span>}</div>
                    {p.streaming ? (
                      <div className="member-sub live">Yayında</div>
                    ) : p.voice_channel_id ? (
                      <div className="member-sub">Sesli sohbette</div>
                    ) : profiles[m.user_id]?.custom_status ? (
                      <div className="member-sub">{profiles[m.user_id]?.custom_status}</div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
      {offline.length > 0 && (
        <section>
          <div className="category">Çevrimdışı — {offline.length}</div>
          {offline.sort(byName).map((m) => (
            <div key={m.user_id} className="member offline">
              <Avatar profile={profiles[m.user_id]} userId={m.user_id} size={32} status="offline" />
              <div className="member-text">
                <div className="member-name">{name(m.user_id) || 'Üye'}</div>
              </div>
            </div>
          ))}
        </section>
      )}
    </aside>
  )
}
