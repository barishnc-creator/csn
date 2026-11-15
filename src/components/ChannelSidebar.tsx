import { useEffect, useState } from 'react'
import { canInstall, isStandalone, onInstallChange, promptInstall } from '../lib/install'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useVoice } from '../voice/VoiceContext'
import Avatar from './Avatar'
import Icon from './Icon'
import ChannelSettingsModal from './ChannelSettingsModal'
import type { SettingsTab } from './SettingsModal'

interface Props {
  currentId: string | null
  onSelect: (id: string) => void
  unread: Record<string, number>
  mentions: Record<string, number>
  onOpenSettings: (tab: SettingsTab) => void
  onFriends: () => void
}

export default function ChannelSidebar({ currentId, onSelect, unread, mentions, onOpenSettings, onFriends }: Props) {
  const { channels, presence, profiles, myRole, isOwner, can, openProfile, openUserMenu, canJoin } = useApp()
  const [chSettings, setChSettings] = useState<string | null>(null)
  const voice = useVoice()
  const [menu, setMenu] = useState(false)

  const [reloadOpen, setReloadOpen] = useState(false)
  const [installable, setInstallable] = useState(canInstall())
  useEffect(() => {
    const off = onInstallChange(() => setInstallable(canInstall()))
    return () => {
      off()
    }
  }, [])
  const text = channels.filter((c) => c.kind === 'text')
  const voiceChannels = channels.filter((c) => c.kind === 'voice')
  const speaking = new Set(voice.participants.filter((p) => p.speaking).map((p) => p.id))

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <button className="sidebar-title" onClick={() => setMenu((m) => !m)} title="Sunucu menüsü">
          <span className="server-mini">C</span>
          <span>CSN</span>
        </button>
        <div className="sidebar-header-actions">
          <button className="icon-btn" title="Arkadaşlar" onClick={onFriends}><Icon name="friends" size={18} /></button>
          <button
            className={`icon-btn${menu ? ' active' : ''}`}
            title="Sunucu ayarları"
            onClick={() => setMenu((m) => !m)}
          >
            <Icon name="gear" size={18} />
          </button>
        </div>
      </header>
      {menu && (
        <div className="dropdown" onMouseLeave={() => setMenu(false)}>
          {isOwner && (
            <button className="accent" onClick={() => { setMenu(false); setReloadOpen(true) }}>
              <Icon name="refresh" size={16} /> Herkesi yenile
            </button>
          )}
          {can('create_invites') && (
            <button onClick={() => { setMenu(false); onOpenSettings('invites') }}>
              <Icon name="users" size={16} /> Arkadaş davet et
            </button>
          )}
          {can('manage_channels') && (
            <button onClick={() => { setMenu(false); onOpenSettings('channels') }}>
              <Icon name="plusCircle" size={16} /> Kanalları yönet
            </button>
          )}
          {myRole === 'admin' && (
            <button onClick={() => { setMenu(false); onOpenSettings('revisions') }}>
              <Icon name="file" size={16} /> Revizeler
            </button>
          )}
          {myRole === 'admin' && (
            <button onClick={() => { setMenu(false); onOpenSettings('roles') }}>
              <Icon name="shield" size={16} /> Roller
            </button>
          )}
          {myRole === 'admin' && (
            <button onClick={() => { setMenu(false); onOpenSettings('members') }}>
              <Icon name="users" size={16} /> Üyeler
            </button>
          )}
          <div className="dropdown-sep" />
          {installable && !isStandalone() && (
            <button className="accent" onClick={() => { setMenu(false); promptInstall() }}>
              <Icon name="download" size={16} /> Uygulama olarak yükle
            </button>
          )}
          <button onClick={() => { setMenu(false); onOpenSettings('profile') }}>
            <Icon name="edit" size={16} /> Profilimi düzenle
          </button>
          <button className="danger" onClick={() => supabase.auth.signOut()}>
            <Icon name="logout" size={16} /> Çıkış yap
          </button>
        </div>
      )}

      <div className="channel-scroll">
        <div className="category">Metin kanalları</div>
        {text.map((c) => {
          const n = unread[c.id] ?? 0
          const m = mentions[c.id] ?? 0
          return (
            <button
              key={c.id}
              className={`channel${c.id === currentId ? ' active' : ''}${n ? ' unread' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <Icon name="hash" size={18} className="channel-icon" />
              <span className="channel-name">{c.name}</span>
              {c.allowed_roles?.length || !canJoin(c) ? <Icon name="lock" size={13} className="channel-lock" /> : null}
              {m > 0 && <span className="badge">{m}</span>}
              {can('manage_channels') && (
                <span className="channel-gear" title="Kanal ayarları" onClick={(e) => { e.stopPropagation(); setChSettings(c.id) }}><Icon name="gear" size={14} /></span>
              )}
            </button>
          )
        })}

        <div className="category">Ses kanalları</div>
        {voiceChannels.map((c) => {
          const inside = Object.values(presence).filter((p) => p.voice_channel_id === c.id)
          return (
            <div key={c.id}>
              <button
                className={`channel${c.id === currentId ? ' active' : ''}${voice.channelId === c.id ? ' connected' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                <Icon name="speaker" size={18} className="channel-icon" />
                <span className="channel-name">{c.name}</span>
                {c.allowed_roles?.length || !canJoin(c) ? <Icon name="lock" size={13} className="channel-lock" /> : null}
                {can('manage_channels') && (
                  <span className="channel-gear" title="Kanal ayarları" onClick={(e) => { e.stopPropagation(); setChSettings(c.id) }}><Icon name="gear" size={14} /></span>
                )}
                {voice.connecting && voice.channelId !== c.id && currentId === c.id && <span className="mini-spinner" />}
              </button>
              {inside.map((p) => (
                <div
                  key={p.user_id}
                  className="voice-user"
                  onClick={() => openProfile(p.user_id)}
                  onContextMenu={(e) => { e.preventDefault(); openUserMenu(p.user_id, e.clientX, e.clientY) }}
                >
                  <Avatar profile={profiles[p.user_id]} userId={p.user_id} size={22} speaking={speaking.has(p.user_id)} />
                  <span className="voice-user-name">{profiles[p.user_id]?.display_name ?? 'Üye'}</span>
                  {p.streaming && <span className="live-tag">CANLI</span>}
                  {p.deafened ? (
                    <Icon name="headphonesOff" size={14} className="voice-flag" />
                  ) : p.muted ? (
                    <Icon name="micOff" size={14} className="voice-flag" />
                  ) : null}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {voice.channelId && <VoiceBar />}
      <UserPanel onOpenSettings={onOpenSettings} />

      {reloadOpen && <ReloadDialog onClose={() => setReloadOpen(false)} />}
      {chSettings && <ChannelSettingsModal channelId={chSettings} onClose={() => setChSettings(null)} />}
    </aside>
  )
}

function ReloadDialog({ onClose }: { onClose: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function send() {
    setBusy(true)
    const { error } = await supabase.rpc('broadcast_reload', { note: note.trim() || null })
    setBusy(false)
    if (error) setError(error.message)
    else onClose()
  }
  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-head">
          <h3>Herkesi yenile</h3>
          <button className="icon-btn" onClick={onClose} title="Kapat"><Icon name="x" /></button>
        </div>
        <p className="muted">CSN'yi açık tutan herkesin ekranı 5 saniye içinde yenilenir ve yeni sürüm yüklenir. Sesli sohbette olanların bağlantısı koparılmaz; onlara bir uyarı gösterilir.</p>
        <label>
          Kısa not (isteğe bağlı)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="ör. Emoji tepkileri geldi!" autoFocus />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" onClick={send} disabled={busy}><Icon name="refresh" size={16} /> Yenile</button>
        </div>
      </div>
    </div>
  )
}

export function VoiceBar() {
  const voice = useVoice()
  const { channels, dmPartner, profiles } = useApp()
  const ch = channels.find((c) => c.id === voice.channelId)
  const label = ch?.kind === 'dm' ? `@${profiles[dmPartner(ch.id) ?? '']?.display_name ?? 'Görüşme'}` : ch?.name ?? ''
  return (
    <div className="voice-bar">
      <div className="voice-bar-top">
        <div>
          <div className="voice-bar-status">
            <Icon name="live" size={16} /> Ses bağlandı
          </div>
          <div className="voice-bar-channel">{label}</div>
        </div>
        <button className="icon-btn" title="Bağlantıyı kes" onClick={voice.leave}>
          <Icon name="phoneOff" />
        </button>
      </div>
      <div className="voice-bar-actions">
        <button className={`pill-btn${voice.cameraOn ? ' on' : ''}`} onClick={voice.toggleCamera} title="Kamera">
          <Icon name={voice.cameraOn ? 'camera' : 'cameraOff'} size={18} />
        </button>
        <button className={`pill-btn${voice.screenOn ? ' on' : ''}`} onClick={voice.toggleScreen} title="Ekran paylaş">
          <Icon name="screen" size={18} />
        </button>
      </div>
    </div>
  )
}

export function UserPanel({ onOpenSettings }: { onOpenSettings: (tab: SettingsTab) => void }) {
  const { me, userId, myStatus, setMyStatus, openProfile } = useApp()
  const voice = useVoice()
  const [statusMenu, setStatusMenu] = useState(false)
  const labels = { online: 'Çevrimiçi', idle: 'Boşta', dnd: 'Rahatsız etmeyin' } as const

  return (
    <div className="user-panel">
      <button className="icon-btn logout-btn" title="Çıkış yap" onClick={() => confirm('CSN hesabından çıkış yapılsın mı?') && supabase.auth.signOut()}>
        <Icon name="logout" size={18} />
      </button>
      <button className="user-panel-me" onClick={() => setStatusMenu((s) => !s)}>
        <Avatar profile={me} userId={userId} size={32} status={myStatus} speaking={voice.pttActive} />
        <div className="user-panel-text">
          <div className="user-panel-name">{me?.display_name ?? '…'}</div>
          <div className="user-panel-status">{me?.custom_status || labels[myStatus]}</div>
        </div>
      </button>
      {statusMenu && (
        <div className="dropdown status-menu" onMouseLeave={() => setStatusMenu(false)}>
          <button onClick={() => { openProfile(userId); setStatusMenu(false) }}>
            <Icon name="users" size={16} /> Profilimi görüntüle
          </button>
          <div className="dropdown-sep" />
          <button onClick={() => { setMyStatus('online'); setStatusMenu(false) }}>
            <span className="status-dot static online" /> Çevrimiçi
          </button>
          <button onClick={() => { setMyStatus('dnd'); setStatusMenu(false) }}>
            <span className="status-dot static dnd" /> Rahatsız etmeyin
          </button>
        </div>
      )}
      <button className={`icon-btn${voice.muted ? ' danger' : ''}`} onClick={voice.toggleMute} title={voice.muted ? 'Mikrofonu aç' : 'Sustur'}>
        <Icon name={voice.muted ? 'micOff' : 'mic'} />
      </button>
      <button className={`icon-btn${voice.deafened ? ' danger' : ''}`} onClick={voice.toggleDeafen} title={voice.deafened ? 'Sesi aç' : 'Sağırlaştır'}>
        <Icon name={voice.deafened ? 'headphonesOff' : 'headphones'} />
      </button>
      <button className="icon-btn" onClick={() => onOpenSettings('voice')} title="Ayarlar">
        <Icon name="gear" />
      </button>
    </div>
  )
}
