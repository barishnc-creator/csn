import { useEffect, useState } from 'react'
import { signedUrl } from '../lib/files'
import { useApp } from '../lib/store'
import type { Profile, Role } from '../lib/types'
import { colorFor, formatTag } from '../lib/format'
import Avatar from './Avatar'
import Icon from './Icon'
import { FriendButton } from './FriendsView'
import { acceptFriend, sendFriendRequest } from '../lib/friends'

const baseRole: Record<Role, string> = { admin: 'Yönetici', mod: 'Moderatör', member: 'Üye' }
const statusText = { online: 'Çevrimiçi', idle: 'Dışarıda', dnd: 'Rahatsız etmeyin', invisible: 'Çevrimdışı görünüyor', offline: 'Çevrimdışı' } as const

export default function UserProfileModal({ userId, onClose, onEditProfile }: { userId: string; onClose: () => void; onEditProfile: () => void }) {
  const { profiles, members, presence, rolesOf, userId: me, openDm, channels, friendState } = useApp()
  const [busy, setBusy] = useState(false)
  const p = profiles[userId]
  const member = members.find((m) => m.user_id === userId)
  const pres = presence[userId]
  const status = pres?.status ?? 'offline'
  const voiceCh = pres?.voice_channel_id ? channels.find((c) => c.id === pres.voice_channel_id) : undefined

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="profile-modal">
        <ProfileCard
          profile={p}
          userId={userId}
          status={status}
          footer={
            <>
              <div className="profile-actions-top">
                <button className="icon-btn on-banner" onClick={onClose} title="Kapat (Esc)"><Icon name="x" /></button>
              </div>
              <div className="profile-section">
                <div className="profile-label">Durum</div>
                <div>
                  <span className={`status-dot static ${status}`} /> {statusText[status]}
                  {voiceCh && <span className="muted"> · {voiceCh.kind === 'dm' ? 'Özel görüşmede' : `🔊 ${voiceCh.name}`}</span>}
                </div>
              </div>
              <div className="profile-section">
                <div className="profile-label">Roller</div>
                <div className="role-chips">
                  {member?.is_owner && <span className="role-chip owner"><Icon name="crown" size={12} /> Sunucu sahibi</span>}
                  {member && <span className="role-chip base">{baseRole[member.role]}</span>}
                  {rolesOf(userId).map((r) => (
                    <span key={r.id} className="role-chip" style={{ ['--role' as string]: r.color }}>
                      <i /> {r.name}
                    </span>
                  ))}
                </div>
              </div>
              {member && (
                <div className="profile-section">
                  <div className="profile-label">CSN üyesi</div>
                  <div>{new Date(member.joined_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
              )}
              <div className="profile-buttons">
                {userId === me ? (
                  <button className="btn primary block" onClick={onEditProfile}><Icon name="edit" size={16} /> Profili düzenle</button>
                ) : (
                  <div className="profile-button-row">
                  <FriendButton
                    state={friendState(userId).state}
                    onSend={() => sendFriendRequest(userId).catch((e) => alert(e.message))}
                    onAccept={() => { const id = friendState(userId).id; if (id) acceptFriend(id) }}
                  />
                  <button
                    className="btn primary block"
                    disabled={busy || !member}
                    onClick={async () => {
                      setBusy(true)
                      await openDm(userId)
                      setBusy(false)
                    }}
                  >
                    <Icon name="message" size={16} /> Mesaj gönder
                  </button>
                  </div>
                )}
              </div>
            </>
          }
        />
      </div>
    </div>
  )
}

/** Profil kartının görsel kısmı: ayarlardaki canlı önizlemede de kullanılır */
export function ProfileCard({
  profile,
  userId,
  status,
  footer,
}: {
  profile: Profile | undefined | null
  userId: string
  status?: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'
  footer?: React.ReactNode
}) {
  const banner = profile?.banner_color ?? colorFor(userId)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const bannerPath = profile?.banner_path
  useEffect(() => {
    let alive = true
    if (!bannerPath) setBannerUrl(null)
    else signedUrl(bannerPath).then((u) => alive && setBannerUrl(u))
    return () => {
      alive = false
    }
  }, [bannerPath])
  return (
    <div className="profile-card-v2">
      <div
        className={`profile-banner${bannerUrl ? ' has-image' : ''}`}
        style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : { background: `linear-gradient(135deg, ${banner}, color-mix(in srgb, ${banner} 55%, #000))` }}
      />
      <div className="profile-avatar-wrap">
        <Avatar profile={profile} userId={userId} size={88} status={status} />
      </div>
      <div className="profile-inner">
        <div className="profile-name">
          {profile?.display_name ?? 'Üye'}
          {profile?.tag ? <span className="profile-tag">{formatTag(profile.tag)}</span> : null}
        </div>
        {profile?.pronouns && <div className="profile-pronouns">{profile.pronouns}</div>}
        {profile?.custom_status && <div className="profile-custom">💬 {profile.custom_status}</div>}
        {profile?.bio && (
          <div className="profile-section">
            <div className="profile-label">Hakkımda</div>
            <div className="profile-bio">{profile.bio}</div>
          </div>
        )}
        {footer}
      </div>
    </div>
  )
}
