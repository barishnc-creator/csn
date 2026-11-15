import { confirmDialog } from '../lib/dialog'
import { useState } from 'react'
import { useApp } from '../lib/store'
import { acceptFriend, removeFriendship, sendFriendRequest } from '../lib/friends'
import Avatar from './Avatar'
import Icon from './Icon'
import { formatTag } from '../lib/format'
import type { UserStatus } from '../lib/types'

type Tab = 'online' | 'all' | 'pending' | 'add'
const statusText = { online: 'Çevrimiçi', idle: 'Dışarıda', dnd: 'Rahatsız etmeyin', invisible: 'Çevrimdışı' } as const

/** Arkadaşlar: istek gönder, kabul et / reddet, arkadaş listesi */
export default function FriendsView() {
  const { members, profiles, presence, userId, openDm, openProfile, channels, nameColor, friendships, friendState } = useApp()
  const [tab, setTab] = useState<Tab>('online')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  const other = (f: { requester: string; addressee: string }) => (f.requester === userId ? f.addressee : f.requester)
  const friends = friendships.filter((f) => f.status === 'accepted').map(other)
  const incoming = friendships.filter((f) => f.status === 'pending' && f.addressee === userId)
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.requester === userId)
  const name = (id: string) => profiles[id]?.display_name ?? 'Üye'
  const match = (id: string) => `${name(id)}${formatTag(profiles[id]?.tag)}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr').trim())
  const byName = (a: string, b: string) => name(a).localeCompare(name(b), 'tr')

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onlineFriends = friends.filter((id) => presence[id] && presence[id].status !== 'invisible')
  const list = (tab === 'online' ? onlineFriends : friends).filter(match).sort(byName)
  const candidates = members.map((m) => m.user_id).filter((id) => id !== userId && match(id)).sort(byName)

  function statusLine(id: string) {
    const pr = presence[id]
    const vc = pr?.voice_channel_id ? channels.find((c) => c.id === pr.voice_channel_id) : undefined
    if (vc) return vc.kind === 'dm' ? 'Özel görüşmede' : `🔊 ${vc.name}`
    return pr ? profiles[id]?.custom_status || statusText[pr.status] : 'Çevrimdışı'
  }

  return (
    <div className="friends">
      <header className="main-header">
        <Icon name="friends" size={20} className="header-icon" />
        <span className="header-title">Arkadaşlar</span>
        <div className="segmented small">
          <button className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>Çevrimiçi <span className="seg-count">{onlineFriends.length}</span></button>
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Tümü <span className="seg-count">{friends.length}</span></button>
          <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
            Bekleyen {incoming.length > 0 ? <span className="badge">{incoming.length}</span> : <span className="seg-count">{outgoing.length}</span>}
          </button>
        </div>
        <button className={`btn small ${tab === 'add' ? 'ghost' : 'success'}`} onClick={() => setTab('add')}>
          <Icon name="userPlus" size={15} /> Arkadaş ekle
        </button>
      </header>

      <div className="friends-body">
        <input className="search-input" placeholder={tab === 'add' ? 'Üye adı ya da #etiket yaz…' : 'Ara…'} value={q} onChange={(e) => setQ(e.target.value)} />
        {error && <div className="form-error">{error}</div>}

        {(tab === 'online' || tab === 'all') && (
          <>
            <div className="category">{tab === 'online' ? 'Çevrimiçi' : 'Tüm arkadaşlar'} — {list.length}</div>
            {list.length === 0 && (
              <Empty
                text={friends.length === 0 ? 'Henüz arkadaşın yok. "Arkadaş ekle" ile istek gönder.' : 'Şu an çevrimiçi arkadaşın yok.'}
                action={friends.length === 0 ? () => setTab('add') : undefined}
              />
            )}
            {list.map((id) => {
              const fid = friendState(id).id
              return (
                <Row key={id} id={id} sub={statusLine(id)} onOpen={() => openProfile(id)} color={nameColor(id)} status={presence[id]?.status}>
                  <button className="icon-btn round" title="Mesaj gönder" onClick={() => openDm(id)}><Icon name="message" size={18} /></button>
                  <button
                    className="icon-btn round danger"
                    title="Arkadaşlıktan çıkar"
                    onClick={async () => fid && (await confirmDialog({ title: `${name(id)} arkadaşlıktan çıkarılsın mı?`, confirmText: 'Arkadaşlıktan çıkar', danger: true })) && run(() => removeFriendship(fid))}
                  >
                    <Icon name="x" size={18} />
                  </button>
                </Row>
              )
            })}
          </>
        )}

        {tab === 'pending' && (
          <>
            <div className="category">Gelen istekler — {incoming.length}</div>
            {incoming.length === 0 && <p className="muted small">Bekleyen istek yok.</p>}
            {incoming.filter((f) => match(f.requester)).map((f) => (
              <Row key={f.id} id={f.requester} sub="Sana arkadaşlık isteği gönderdi" onOpen={() => openProfile(f.requester)} color={nameColor(f.requester)} status={presence[f.requester]?.status}>
                <button className="icon-btn round success" title="Kabul et" onClick={() => run(() => acceptFriend(f.id))}><Icon name="check" size={18} /></button>
                <button className="icon-btn round danger" title="Reddet" onClick={() => run(() => removeFriendship(f.id))}><Icon name="x" size={18} /></button>
              </Row>
            ))}
            <div className="category">Gönderilen istekler — {outgoing.length}</div>
            {outgoing.length === 0 && <p className="muted small">Gönderilmiş istek yok.</p>}
            {outgoing.filter((f) => match(f.addressee)).map((f) => (
              <Row key={f.id} id={f.addressee} sub="Yanıt bekleniyor" onOpen={() => openProfile(f.addressee)} color={nameColor(f.addressee)} status={presence[f.addressee]?.status}>
                <button className="btn ghost small" onClick={() => run(() => removeFriendship(f.id))}>İsteği geri çek</button>
              </Row>
            ))}
          </>
        )}

        {tab === 'add' && (
          <>
            <div className="category">CSN üyeleri — {candidates.length}</div>
            {candidates.map((id) => {
              const st = friendState(id)
              return (
                <Row key={id} id={id} sub={`${formatTag(profiles[id]?.tag)} · ${statusLine(id)}`} onOpen={() => openProfile(id)} color={nameColor(id)} status={presence[id]?.status}>
                  <FriendButton state={st.state} onSend={() => run(() => sendFriendRequest(id))} onAccept={() => st.id && run(() => acceptFriend(st.id!))} />
                </Row>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

export function FriendButton({ state, onSend, onAccept }: { state: 'none' | 'friends' | 'outgoing' | 'incoming'; onSend: () => void; onAccept: () => void }) {
  if (state === 'friends') return <span className="friend-pill ok"><Icon name="check" size={14} /> Arkadaşsınız</span>
  if (state === 'outgoing') return <span className="friend-pill">İstek gönderildi</span>
  if (state === 'incoming') return <button className="btn success small" onClick={onAccept}><Icon name="check" size={15} /> Kabul et</button>
  return <button className="btn primary small" onClick={onSend}><Icon name="userPlus" size={15} /> İstek gönder</button>
}

function Row({ id, sub, onOpen, color, status, children }: { id: string; sub: string; onOpen: () => void; color?: string; status?: UserStatus; children: React.ReactNode }) {
  const { profiles, openUserMenu } = useApp()
  return (
    <div className="friend-row" onClick={onOpen} onContextMenu={(e) => { e.preventDefault(); openUserMenu(id, e.clientX, e.clientY) }}>
      <Avatar profile={profiles[id]} userId={id} size={40} status={status ?? 'offline'} />
      <div className="friend-text">
        <div className="friend-name" style={{ color }}>{profiles[id]?.display_name ?? 'Üye'}</div>
        <div className="muted small">{sub}</div>
      </div>
      <div className="friend-actions" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

function Empty({ text, action }: { text: string; action?: () => void }) {
  return (
    <div className="friends-empty">
      <Icon name="friends" size={40} />
      <p className="muted">{text}</p>
      {action && <button className="btn primary small" onClick={action}><Icon name="userPlus" size={15} /> Arkadaş ekle</button>}
    </div>
  )
}
