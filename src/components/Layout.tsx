import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'
import { useVoice } from '../voice/VoiceContext'
import { playSound } from '../voice/sounds'
import ChannelSidebar from './ChannelSidebar'
import DmSidebar from './DmSidebar'
import ChatView from './ChatView'
import MemberList from './MemberList'
import VoiceView from './VoiceView'
import SettingsModal, { type SettingsTab } from './SettingsModal'
import UserProfileModal from './UserProfileModal'
import Avatar from './Avatar'
import Icon from './Icon'

export default function Layout() {
  const { channels, userId, profiles, me, myStatus, mode, setMode, selectedId, select, can, dmPartner, presence, profileOf, openProfile, reloadNotice, dismissReload } = useApp()
  const voice = useVoice()
  const [showMembers, setShowMembers] = useState(true)
  const [settings, setSettings] = useState<SettingsTab | null>(null)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [mentions, setMentions] = useState<Record<string, number>>({})
  const [lastServerChannel, setLastServerChannel] = useState<string | null>(null)

  const serverChannels = channels.filter((c) => c.kind !== 'dm')
  const dmChannels = channels.filter((c) => c.kind === 'dm')
  const selected = channels.find((c) => c.id === selectedId)
  const current =
    mode === 'dm'
      ? selected?.kind === 'dm'
        ? selected
        : null
      : selected && selected.kind !== 'dm'
        ? selected
        : serverChannels.find((c) => c.id === lastServerChannel) ?? serverChannels.find((c) => c.kind === 'text') ?? null

  const currentRef = useRef(current?.id)
  currentRef.current = current?.id

  useEffect(() => {
    if (!current) return
    if (current.kind !== 'dm') setLastServerChannel(current.id)
    setUnread((u) => (u[current.id] ? { ...u, [current.id]: 0 } : u))
    setMentions((m) => (m[current.id] ? { ...m, [current.id]: 0 } : m))
  }, [current?.id, current?.kind])

  // Masaüstü bildirim izni
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }, [])

  // Yeni mesajlar → okunmamış sayacı + bildirim
  const myName = me?.display_name
  const channelsRef = useRef(channels)
  channelsRef.current = channels
  const canRef = useRef(can)
  canRef.current = can
  useEffect(() => {
    const ch = supabase
      .channel('csn-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const msg = p.new as Message
        if (msg.author_id === userId) return
        const isDm = channelsRef.current.find((c) => c.id === msg.channel_id)?.kind === 'dm'
        const everyone = msg.content.includes('@herkes') && canRef.current('mention_everyone', msg.author_id)
        const mentioned = isDm || everyone || (!!myName && msg.content.includes(`@${myName}`))
        const visible = msg.channel_id === currentRef.current && document.hasFocus()
        if (!visible) {
          setUnread((u) => ({ ...u, [msg.channel_id]: (u[msg.channel_id] ?? 0) + 1 }))
          if (mentioned) setMentions((m) => ({ ...m, [msg.channel_id]: (m[msg.channel_id] ?? 0) + 1 }))
        }
        if (myStatus === 'dnd' || visible) return
        if (mentioned || msg.channel_id === currentRef.current) playSound('message')
        if (mentioned && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const author = profiles[msg.author_id]?.display_name ?? 'Biri'
          new Notification(isDm ? `${author} sana mesaj gönderdi` : `${author} senden bahsetti`, {
            body: msg.content.slice(0, 140) || 'Ek dosya',
            tag: `csn-${msg.id}`,
          })
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [userId, myName, myStatus, profiles])

  // Pencere başlığı
  const totalMentions = Object.values(mentions).reduce((a, b) => a + b, 0)
  useEffect(() => {
    document.title = totalMentions ? `(${totalMentions}) CSN` : 'CSN'
  }, [totalMentions])

  // Gelen DM araması: biri, üyesi olduğum bir DM'nin ses odasında ve ben değilim
  const incoming = dmChannels.find(
    (c) => c.id !== voice.channelId && Object.values(presence).some((p) => p.user_id !== userId && p.voice_channel_id === c.id),
  )
  const [ignoredCall, setIgnoredCall] = useState<string | null>(null)
  const callerId = incoming ? dmPartner(incoming.id) : undefined
  const showCall = incoming && ignoredCall !== incoming.id && callerId
  useEffect(() => {
    if (!showCall || myStatus === 'dnd') return
    playSound('join')
    const t = window.setInterval(() => playSound('join'), 2500)
    return () => window.clearInterval(t)
  }, [showCall, myStatus])

  // Yenile: sunucu sahibi yeni sürüm yayınladı
  const [countdown, setCountdown] = useState<number | null>(null)
  useEffect(() => {
    if (!reloadNotice) return
    if (voice.channelId) {
      setCountdown(null) // seste olanı zorla koparma
      return
    }
    setCountdown(5)
    const t = window.setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null
        if (c <= 1) {
          window.location.reload()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [reloadNotice, voice.channelId])

  function selectChannel(id: string) {
    const ch = channels.find((c) => c.id === id)
    if (!ch) return
    select(id, ch.kind === 'dm' ? 'dm' : 'server')
    if (ch.kind === 'voice' && voice.channelId !== id) voice.join(id)
  }

  const dmUnread = dmChannels.reduce((a, c) => a + (unread[c.id] ?? 0), 0)

  return (
    <div className="app">
      <nav className="server-rail">
        <button
          className={`rail-btn home${mode === 'dm' ? ' active' : ''}`}
          title="Doğrudan mesajlar"
          onClick={() => {
            setMode('dm')
            const first = dmChannels.find((c) => c.id === selectedId) ?? dmChannels[0]
            select(first?.id ?? null, 'dm')
          }}
        >
          <Icon name="message" size={22} />
          {dmUnread > 0 && <span className="rail-badge">{dmUnread}</span>}
        </button>
        <div className="rail-sep" />
        <button
          className={`rail-btn server${mode === 'server' ? ' active' : ''}`}
          title="CSN"
          onClick={() => select(lastServerChannel ?? serverChannels.find((c) => c.kind === 'text')?.id ?? null, 'server')}
        >
          CSN
        </button>
      </nav>

      {mode === 'dm' ? (
        <DmSidebar currentId={current?.id ?? null} onSelect={selectChannel} unread={unread} onOpenSettings={setSettings} />
      ) : (
        <ChannelSidebar currentId={current?.id ?? null} onSelect={selectChannel} unread={unread} mentions={mentions} onOpenSettings={setSettings} />
      )}

      <main className="main">
        {current?.kind === 'voice' ? (
          <VoiceView channel={current} onToggleMembers={() => setShowMembers((s) => !s)} />
        ) : current ? (
          <ChatView key={current.id} channel={current} onToggleMembers={() => setShowMembers((s) => !s)} />
        ) : mode === 'dm' ? (
          <div className="empty-state">
            <Icon name="message" size={48} />
            <h2>Doğrudan mesajlar</h2>
            <p className="muted">Bir arkadaşının profiline tıklayıp <strong>Mesaj gönder</strong> diyerek sohbet başlat.</p>
          </div>
        ) : (
          <div className="empty-state">Henüz kanal yok. Sunucu ayarlarından kanal ekleyebilirsin.</div>
        )}
      </main>

      {showMembers && current?.kind === 'text' && <MemberList />}
      {settings && <SettingsModal initialTab={settings} onClose={() => setSettings(null)} />}
      {profileOf && <UserProfileModal userId={profileOf} onClose={() => openProfile(null)} onEditProfile={() => { openProfile(null); setSettings('profile') }} />}

      {showCall && incoming && callerId && (
        <div className="call-toast">
          <Avatar profile={profiles[callerId]} userId={callerId} size={48} speaking />
          <div className="call-toast-text">
            <strong>{profiles[callerId]?.display_name ?? 'Biri'}</strong>
            <span className="muted">seni arıyor…</span>
          </div>
          <button className="round-btn success solid" title="Katıl" onClick={() => { select(incoming.id, 'dm'); voice.join(incoming.id) }}>
            <Icon name="phone" size={20} />
          </button>
          <button className="round-btn danger solid" title="Yoksay" onClick={() => setIgnoredCall(incoming.id)}>
            <Icon name="phoneOff" size={20} />
          </button>
        </div>
      )}

      {reloadNotice && (
        <div className="reload-banner">
          <Icon name="refresh" size={18} />
          <div>
            <strong>CSN güncellendi.</strong>{' '}
            {reloadNotice.note && <span>{reloadNotice.note} · </span>}
            {countdown !== null ? `${countdown} saniye içinde yenileniyor…` : 'Sesli sohbettesin; hazır olduğunda yenile.'}
          </div>
          <button className="btn primary small" onClick={() => window.location.reload()}>Şimdi yenile</button>
          {countdown === null && <button className="btn ghost small" onClick={dismissReload}>Sonra</button>}
        </div>
      )}

      {voice.error && (
        <div className="toast error" onClick={voice.clearError}>
          {voice.error}
          <span className="toast-close">×</span>
        </div>
      )}
    </div>
  )
}
