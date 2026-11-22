import { useApp } from '../lib/store'
import { useVoice } from '../voice/VoiceContext'
import Avatar from './Avatar'
import Icon from './Icon'
import { statusLabel } from '../lib/status'

/** Revize #28: Doğrudan mesajlar açıkken sağ panel — arkadaşların hangi sunucuda / hangi ses kanalında olduğu */
export default function FriendsActivity() {
  const { friendships, userId, profiles, presence, channels, openProfile, openUserMenu, select, canJoin } = useApp()
  const voice = useVoice()

  const friendIds = friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => (f.requester === userId ? f.addressee : f.requester))
  const isOn = (uid: string) => !!presence[uid] && presence[uid].status !== 'invisible'
  const name = (uid: string) => profiles[uid]?.display_name ?? 'Üye'
  const byName = (a: string, b: string) => name(a).localeCompare(name(b), 'tr')
  const inVoice = (uid: string) => !!presence[uid]?.voice_channel_id

  const online = friendIds.filter(isOn).sort((a, b) => Number(inVoice(b)) - Number(inVoice(a)) || byName(a, b))
  const offline = friendIds.filter((u) => !isOn(u)).sort(byName)

  function goTo(channelId: string) {
    const ch = channels.find((c) => c.id === channelId)
    if (!ch || ch.kind !== 'voice') return
    select(ch.id, 'server')
    if (canJoin(ch) && voice.channelId !== ch.id) voice.join(ch.id)
  }

  const card = (uid: string, on: boolean) => {
    const p = presence[uid]
    const vc = p?.voice_channel_id ? channels.find((c) => c.id === p.voice_channel_id) : undefined
    return (
      <div
        key={uid}
        className={`friend-activity${on ? '' : ' offline'}${vc ? ' in-voice' : ''}`}
        onClick={() => openProfile(uid)}
        onContextMenu={(e) => { e.preventDefault(); openUserMenu(uid, e.clientX, e.clientY) }}
      >
        <div className="friend-activity-top">
          <Avatar profile={profiles[uid]} userId={uid} size={34} status={on ? p!.status : 'offline'} />
          <div className="member-text">
            <div className="member-name">{name(uid)}</div>
            <div className="member-sub">
              {on ? profiles[uid]?.custom_status || statusLabel(p!.status) : 'Çevrimdışı'}
            </div>
          </div>
        </div>
        {on && (
          <div className="friend-activity-where">
            <span className="fa-server">C</span>
            <div className="fa-where-text">
              <strong>Cousy</strong>
              {p?.voice_channel_id ? (
                vc?.kind === 'voice' ? (
                  <span className="fa-voice">
                    <Icon name="speaker" size={12} /> {vc.name}
                    {p.streaming && <span className="live-tag">CANLI</span>}
                  </span>
                ) : (
                  <span className="fa-voice"><Icon name="phone" size={12} /> Özel görüşmede</span>
                )
              ) : (
                <span className="muted">Sunucuda, ses kanalında değil</span>
              )}
            </div>
            {vc?.kind === 'voice' && voice.channelId !== vc.id && (
              <button className="fa-join" title={`${vc.name} odasına git`} onClick={(e) => { e.stopPropagation(); goTo(vc.id) }}>
                Katıl
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="member-list friends-activity">
      <header className="member-list-head">
        <div className="member-list-title">
          <Icon name="friends" size={16} />
          <span>ARKADAŞ ETKİNLİĞİ</span>
        </div>
        <div className="member-list-stats">
          <span className="stat-pill online"><i /> {online.length} çevrimiçi</span>
          <span className="stat-pill">{online.filter(inVoice).length} seste</span>
        </div>
      </header>
      {friendIds.length === 0 && (
        <div className="fa-empty">
          <Icon name="userPlus" size={22} />
          <strong>Henüz arkadaşın yok</strong>
          <span className="muted small">Bir üyeye sağ tıklayıp “Arkadaş ekle” de; burada nerede olduğunu görürsün.</span>
        </div>
      )}
      {online.length > 0 && (
        <section>
          <div className="member-group-head">
            <span className="member-group-name">Çevrimiçi</span>
            <span className="member-group-count">{online.length}</span>
          </div>
          {online.map((u) => card(u, true))}
        </section>
      )}
      {offline.length > 0 && (
        <section>
          <div className="member-group-head">
            <span className="member-group-name">Çevrimdışı</span>
            <span className="member-group-count">{offline.length}</span>
          </div>
          {offline.map((u) => card(u, false))}
        </section>
      )}
    </aside>
  )
}
