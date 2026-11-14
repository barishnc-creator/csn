import { useState } from 'react'
import { useApp } from '../lib/store'
import Avatar from './Avatar'
import Icon from './Icon'
import { UserPanel, VoiceBar } from './ChannelSidebar'
import type { SettingsTab } from './SettingsModal'
import { useVoice } from '../voice/VoiceContext'

interface Props {
  currentId: string | null
  onSelect: (id: string) => void
  unread: Record<string, number>
  onOpenSettings: (tab: SettingsTab) => void
}

export default function DmSidebar({ currentId, onSelect, unread, onOpenSettings }: Props) {
  const { channels, dmPartner, profiles, presence, members, userId, openDm, select, friendships, openUserMenu } = useApp()
  const incomingCount = friendships.filter((f) => f.status === 'pending' && f.addressee === userId).length
  const voice = useVoice()
  const [query, setQuery] = useState('')
  const [picking, setPicking] = useState(false)

  const dms = channels
    .filter((c) => c.kind === 'dm')
    .map((c) => ({ c, uid: dmPartner(c.id) }))
    .filter((x): x is { c: (typeof x)['c']; uid: string } => !!x.uid)

  const candidates = members
    .filter((m) => m.user_id !== userId)
    .map((m) => ({ id: m.user_id, name: profiles[m.user_id]?.display_name ?? 'Üye' }))
    .filter((m) => m.name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return (
    <aside className="sidebar">
      <header className="sidebar-header static">
        <span>Doğrudan mesajlar</span>
        <button className="icon-btn" title="Yeni mesaj" onClick={() => setPicking((p) => !p)}>
          <Icon name={picking ? 'x' : 'plus'} size={18} />
        </button>
      </header>

      <div className="channel-scroll">
        <button className={`dm-item friends-link${currentId === null ? ' active' : ''}`} onClick={() => select(null, 'dm')}>
          <span className="friends-icon"><Icon name="friends" size={18} /></span>
          <span className="dm-name">Arkadaşlar</span>
          {incomingCount > 0 && <span className="badge">{incomingCount}</span>}
        </button>
        <div className="category">Özel mesajlar</div>
        {picking && (
          <div className="dm-picker">
            <input autoFocus placeholder="Kime yazacaksın?" value={query} onChange={(e) => setQuery(e.target.value)} />
            {candidates.map((m) => (
              <button key={m.id} className="dm-item" onClick={() => { setPicking(false); setQuery(''); openDm(m.id) }}>
                <Avatar profile={profiles[m.id]} userId={m.id} size={28} status={presence[m.id]?.status ?? 'offline'} />
                <span>{m.name}</span>
              </button>
            ))}
            {candidates.length === 0 && <p className="muted small">Kimse bulunamadı.</p>}
          </div>
        )}

        {!picking && dms.length === 0 && (
          <p className="muted small dm-empty">Henüz özel mesaj yok. Sağ üstteki <strong>+</strong> ile başlat.</p>
        )}
        {!picking &&
          dms.map(({ c, uid }) => {
            const p = profiles[uid]
            const n = unread[c.id] ?? 0
            const inCall = Object.values(presence).some((x) => x.voice_channel_id === c.id)
            return (
              <button key={c.id} className={`dm-item${c.id === currentId ? ' active' : ''}${n ? ' unread' : ''}`} onClick={() => onSelect(c.id)} onContextMenu={(e) => { e.preventDefault(); openUserMenu(uid, e.clientX, e.clientY) }}>
                <Avatar profile={p} userId={uid} size={32} status={presence[uid]?.status ?? 'offline'} />
                <div className="dm-text">
                  <span className="dm-name">{p?.display_name ?? 'Üye'}</span>
                  {inCall ? <span className="dm-sub live">Sesli görüşmede</span> : p?.custom_status && <span className="dm-sub">{p.custom_status}</span>}
                </div>
                {n > 0 && <span className="badge">{n}</span>}
              </button>
            )
          })}
      </div>

      {voice.channelId && <VoiceBar />}
      <UserPanel onOpenSettings={onOpenSettings} />
    </aside>
  )
}
