import { useState } from 'react'
import { useApp } from '../lib/store'
import Avatar from './Avatar'
import Icon from './Icon'

type Tab = 'online' | 'all' | 'voice'
const statusText = { online: 'Çevrimiçi', idle: 'Boşta', dnd: 'Rahatsız etmeyin' } as const

/** Arkadaşlar: sunucudaki herkes, çevrimiçi durumu, hızlı mesaj ve profil */
export default function FriendsView() {
  const { members, profiles, presence, userId, openDm, openProfile, channels, nameColor } = useApp()
  const [tab, setTab] = useState<Tab>('online')
  const [q, setQ] = useState('')

  const list = members
    .filter((m) => m.user_id !== userId)
    .filter((m) => (tab === 'online' ? !!presence[m.user_id] : tab === 'voice' ? !!presence[m.user_id]?.voice_channel_id : true))
    .filter((m) => (profiles[m.user_id]?.display_name ?? '').toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
    .sort((a, b) => {
      const oa = presence[a.user_id] ? 0 : 1
      const ob = presence[b.user_id] ? 0 : 1
      return oa - ob || (profiles[a.user_id]?.display_name ?? '').localeCompare(profiles[b.user_id]?.display_name ?? '', 'tr')
    })

  const onlineCount = members.filter((m) => m.user_id !== userId && presence[m.user_id]).length
  const voiceCount = members.filter((m) => m.user_id !== userId && presence[m.user_id]?.voice_channel_id).length

  return (
    <div className="friends">
      <header className="main-header">
        <Icon name="friends" size={20} className="header-icon" />
        <span className="header-title">Arkadaşlar</span>
        <div className="segmented small">
          <button className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>Çevrimiçi <span className="seg-count">{onlineCount}</span></button>
          <button className={tab === 'voice' ? 'active' : ''} onClick={() => setTab('voice')}>Seste <span className="seg-count">{voiceCount}</span></button>
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Tümü <span className="seg-count">{members.length - 1}</span></button>
        </div>
      </header>
      <div className="friends-body">
        <input className="search-input" placeholder="Arkadaş ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="category">
          {tab === 'online' ? 'Çevrimiçi' : tab === 'voice' ? 'Sesli sohbette' : 'Tüm üyeler'} — {list.length}
        </div>
        {list.length === 0 && (
          <div className="friends-empty">
            <Icon name="users" size={40} />
            <p className="muted">{tab === 'online' ? 'Şu an kimse çevrimiçi değil.' : tab === 'voice' ? 'Şu an kimse seste değil.' : 'Kimse bulunamadı.'}</p>
          </div>
        )}
        {list.map((m) => {
          const p = profiles[m.user_id]
          const pr = presence[m.user_id]
          const vc = pr?.voice_channel_id ? channels.find((c) => c.id === pr.voice_channel_id) : undefined
          return (
            <div key={m.user_id} className="friend-row" onClick={() => openProfile(m.user_id)}>
              <Avatar profile={p} userId={m.user_id} size={40} status={pr?.status ?? 'offline'} />
              <div className="friend-text">
                <div className="friend-name" style={{ color: nameColor(m.user_id) }}>{p?.display_name ?? 'Üye'}</div>
                <div className="muted small">
                  {vc ? (vc.kind === 'dm' ? 'Özel görüşmede' : `🔊 ${vc.name}`) : pr ? p?.custom_status || statusText[pr.status] : 'Çevrimdışı'}
                </div>
              </div>
              <div className="friend-actions" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn round" title="Mesaj gönder" onClick={() => openDm(m.user_id)}><Icon name="message" size={18} /></button>
                <button className="icon-btn round" title="Profil" onClick={() => openProfile(m.user_id)}><Icon name="users" size={18} /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
