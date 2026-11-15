import { confirmDialog } from '../lib/dialog'
import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useVoice } from '../voice/VoiceContext'
import Avatar from './Avatar'
import Icon from './Icon'
import { STATUS_OPTIONS, statusLabel } from '../lib/status'
import ChannelSettingsModal from './ChannelSettingsModal'
import CreateChannelModal from './CreateChannelModal'
import CategoryModal from './CategoryModal'
import SoundpadButton from './Soundpad'
import VoiceExtrasHost from './VoiceExtrasHost'
import { MUSIC_BOT_ID, useMusicRows } from '../voice/music'
import type { SettingsTab } from './SettingsModal'
import type { Channel, ChannelCategory } from '../lib/types'

interface Props {
  currentId: string | null
  onSelect: (id: string) => void
  unread: Record<string, number>
  mentions: Record<string, number>
  onOpenSettings: (tab: SettingsTab) => void
  onFriends: () => void
}

export default function ChannelSidebar({ currentId, onSelect, unread, mentions, onOpenSettings, onFriends }: Props) {
  const { channels, categories, presence, profiles, can, openProfile, openUserMenu, canJoin } = useApp()
  const [chSettings, setChSettings] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ kind: 'text' | 'voice'; categoryId: string | null } | null>(null)
  const [catModal, setCatModal] = useState<{ kind: 'text' | 'voice'; category?: ChannelCategory } | null>(null)
  // Daraltılan kategoriler bu cihazda hatırlanır
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('csn.collapsedCats') ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })
  const toggleCat = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem('csn.collapsedCats', JSON.stringify([...next])) } catch { /* yok say */ }
      return next
    })
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)
  // Yeni kanal realtime ile listeye düşünce ona geç
  useEffect(() => {
    if (pendingSelect && channels.some((c) => c.id === pendingSelect)) {
      onSelect(pendingSelect)
      setPendingSelect(null)
    }
  }, [pendingSelect, channels, onSelect])
  const voice = useVoice()
  const musicRows = useMusicRows()
  const text = channels.filter((c) => c.kind === 'text')
  const voiceChannels = channels.filter((c) => c.kind === 'voice')
  const speaking = new Set(voice.participants.filter((p) => p.speaking).map((p) => p.id))

  const renderText = (c: Channel) => {
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
              {n > 0 && c.id !== currentId && (
                <span key={n} className={`badge${m > 0 ? '' : ' soft'}`} title={m > 0 ? `${m} bahsetme` : `${n} okunmamış mesaj`}>
                  {n > 99 ? '99+' : n}
                </span>
              )}
              {can('manage_channels') && (
                <span className="channel-gear" title="Kanal ayarları" onClick={(e) => { e.stopPropagation(); setChSettings(c.id) }}><Icon name="gear" size={14} /></span>
              )}
            </button>
          )
  }

  const renderVoice = (c: Channel) => {
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
              {musicRows[c.id]?.current && (inside.length > 0 || voice.channelId === c.id) && (
                // Müzik botu ses odasında her zaman en altta
                <div
                  className="voice-user bot"
                  onClick={() => openProfile(MUSIC_BOT_ID)}
                  onContextMenu={(e) => { e.preventDefault(); openUserMenu(MUSIC_BOT_ID, e.clientX, e.clientY) }}
                  title={`Çalıyor: ${musicRows[c.id].current!.title}`}
                >
                  <Avatar profile={profiles[MUSIC_BOT_ID]} userId={MUSIC_BOT_ID} size={22} spinning={!musicRows[c.id].paused} />
                  <span className="voice-user-name">
                    {profiles[MUSIC_BOT_ID]?.display_name ?? 'CSN Müzik'}
                    <span className="voice-user-sub">{musicRows[c.id].paused ? '⏸ ' : '🎵 '}{musicRows[c.id].current!.title}</span>
                  </span>
                  <span className="bot-badge">BOT</span>
                </div>
              )}
            </div>
          )
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="sidebar-title">
          <span className="server-mini">C</span>
          <span>CSN</span>
        </div>
        <div className="sidebar-header-actions">
          <button className="icon-btn" title="Arkadaşlar" onClick={onFriends}><Icon name="friends" size={18} /></button>
        </div>
      </header>

      <div className="channel-scroll">
        {(['text', 'voice'] as const).map((kind) => {
          const list = kind === 'text' ? text : voiceChannels
          const render = kind === 'text' ? renderText : renderVoice
          const known = new Set(categories.map((g) => g.id))
          const loose = list.filter((c) => !c.category_id || !known.has(c.category_id))
          return (
            <div key={kind} className="channel-section">
              <div className="category-row">
                <div className="category">{kind === 'text' ? 'Metin kanalları' : 'Ses kanalları'}</div>
                {can('manage_channels') && (
                  <>
                    <button className="category-add" title="Kategori oluştur" onClick={() => setCatModal({ kind })}><Icon name="folderPlus" size={15} /></button>
                    <button className="category-add" title="Kanal oluştur" onClick={() => setCreating({ kind, categoryId: null })}><Icon name="plus" size={15} /></button>
                  </>
                )}
              </div>
              {loose.map(render)}
              {categories.filter((g) => g.kind === kind).map((g) => {
                const inCat = list.filter((c) => c.category_id === g.id)
                const isCollapsed = collapsed.has(g.id)
                return (
                  <div key={g.id} className="channel-category">
                    <div className="category-row sub">
                      <button className="category toggle" onClick={() => toggleCat(g.id)} title={isCollapsed ? 'Aç' : 'Daralt'}>
                        <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={12} /> {g.name}
                      </button>
                      {can('manage_channels') && (
                        <>
                          <button className="category-add" title="Kategoriyi düzenle" onClick={() => setCatModal({ kind, category: g })}><Icon name="gear" size={13} /></button>
                          <button className="category-add" title={`${g.name} içinde kanal oluştur`} onClick={() => setCreating({ kind, categoryId: g.id })}><Icon name="plus" size={15} /></button>
                        </>
                      )}
                    </div>
                    {isCollapsed
                      ? inCat.filter((c) => c.id === currentId || voice.channelId === c.id).map(render)
                      : inCat.map(render)}
                    {!isCollapsed && inCat.length === 0 && <div className="category-empty">Henüz kanal yok</div>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {voice.channelId && <VoiceBar />}
      <UserPanel onOpenSettings={onOpenSettings} />

      {creating && (
        <CreateChannelModal
          kind={creating.kind}
          categoryId={creating.categoryId}
          onClose={() => setCreating(null)}
          onCreated={(id, k) => { if (k === 'text') setPendingSelect(id) }}
        />
      )}
      {catModal && <CategoryModal kind={catModal.kind} category={catModal.category} onClose={() => setCatModal(null)} />}
      {chSettings && <ChannelSettingsModal channelId={chSettings} onClose={() => setChSettings(null)} />}
    </aside>
  )
}

export function VoiceBar() {
  const voice = useVoice()
  const { channels, dmPartner, profiles } = useApp()
  const ch = channels.find((c) => c.id === voice.channelId)
  const label = ch?.kind === 'dm' ? `@${profiles[dmPartner(ch.id) ?? '']?.display_name ?? 'Görüşme'}` : ch?.name ?? ''
  return (
    <div className="voice-bar">
      <VoiceExtrasHost />
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
        <SoundpadButton variant="pill" />
      </div>
    </div>
  )
}

export function UserPanel({ onOpenSettings }: { onOpenSettings: (tab: SettingsTab) => void }) {
  const { me, userId, myStatus, myChosenStatus: myChosen, setMyStatus, openProfile } = useApp()
  const voice = useVoice()
  const [statusMenu, setStatusMenu] = useState(false)

  return (
    <div className="user-panel">
      <button className="icon-btn logout-btn" title="Çıkış yap" onClick={async () => (await confirmDialog({ title: 'Çıkış yapılsın mı?', message: 'CSN hesabından çıkış yapacaksın.', confirmText: 'Çıkış yap', danger: true })) && supabase.auth.signOut()}>
        <Icon name="logout" size={18} />
      </button>
      <button className="user-panel-me" onClick={() => setStatusMenu((s) => !s)}>
        <Avatar profile={me} userId={userId} size={32} status={myStatus} speaking={voice.pttActive} />
        <div className="user-panel-text">
          <div className="user-panel-name">{me?.display_name ?? '…'}</div>
          <div className="user-panel-status">{me?.custom_status || statusLabel(myStatus)}</div>
        </div>
      </button>
      {statusMenu && (
        <div className="dropdown status-menu" onMouseLeave={() => setStatusMenu(false)}>
          <button onClick={() => { openProfile(userId); setStatusMenu(false) }}>
            <Icon name="users" size={16} /> Profilimi görüntüle
          </button>
          <div className="dropdown-sep" />
          {STATUS_OPTIONS.map((o) => (
            <button key={o.id} className={myChosen === o.id ? 'selected' : ''} onClick={() => { setMyStatus(o.id); setStatusMenu(false) }}>
              <span className={`status-dot static ${o.id === 'invisible' ? 'offline' : o.id}`} /> {o.label}
            </button>
          ))}
        </div>
      )}
      <button className={`icon-btn${voice.muted ? ' danger' : ''}`} onClick={voice.toggleMute} title={voice.muted ? 'Mikrofonu aç' : 'Sustur'}>
        <Icon name={voice.muted ? 'micOff' : 'mic'} />
      </button>
      <button className={`icon-btn${voice.deafened ? ' danger' : ''}`} onClick={voice.toggleDeafen} title={voice.deafened ? 'Sesi aç' : 'Sağırlaştır'}>
        <Icon name={voice.deafened ? 'headphonesOff' : 'headphones'} />
      </button>
      <button className="icon-btn" onClick={() => { setStatusMenu(false); onOpenSettings('profile') }} title="Ayarlar">
        <Icon name="gear" />
      </button>
    </div>
  )
}
