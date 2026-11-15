import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'
import { useVoice } from '../voice/VoiceContext'
import { playSound } from '../voice/sounds'
import { hardReload } from '../lib/version'
import ChannelSidebar from './ChannelSidebar'
import DmSidebar from './DmSidebar'
import ChatView from './ChatView'
import MemberList from './MemberList'
import FriendsActivity from './FriendsActivity'
import VoiceView from './VoiceView'
import SettingsModal, { type SettingsTab } from './SettingsModal'
import UserProfileModal from './UserProfileModal'
import Avatar from './Avatar'
import FriendsView from './FriendsView'
import UserContextMenu from './UserContextMenu'
import Icon from './Icon'

export default function Layout() {
  const { channels, userId, profiles, me, myStatus, mode, setMode, selectedId, select, can, dmPartner, presence, profileOf, openProfile, reloadNotice, dismissReload } = useApp()
  const voice = useVoice()
  // Revize #8: sağdaki üye paneli her ekranda; tercih hatırlanır
  const [showMembers, setShowMembersState] = useState(() => {
    try {
      return localStorage.getItem('csn.members') !== '0'
    } catch {
      return true
    }
  })
  const setShowMembers = (fn: (s: boolean) => boolean) =>
    setShowMembersState((s) => {
      const v = fn(s)
      try {
        localStorage.setItem('csn.members', v ? '1' : '0')
      } catch {
        // yoksay
      }
      return v
    })
  const [settings, setSettings] = useState<SettingsTab | null>(null)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [mentions, setMentions] = useState<Record<string, number>>({})
  const [lastServerChannel, setLastServerChannel] = useState<string | null>(null)
  // Telefonda tek panel: 'nav' = kanal/DM listesi, 'main' = sohbet
  const [mobileView, setMobileView] = useState<'nav' | 'main'>('nav')

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

  // Revize #26: yetkili biri beni başka bir ses odasına taşıdı
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  useEffect(() => {
    const ch = supabase
      .channel('csn-voice-moves')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_moves', filter: `target=eq.${userId}` }, (p) => {
        const row = p.new as { channel_id: string }
        const v = voiceRef.current
        const target = channelsRef.current.find((c) => c.id === row.channel_id && c.kind === 'voice')
        // Yalnız şu an bir ses kanalındaysam taşınırım
        if (!target || !v.channelId || v.channelId === target.id) return
        select(target.id, 'server')
        v.join(target.id)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [userId, select])

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
    if (voice.channelId || !reloadNotice.forced) {
      setCountdown(null) // seste olanı zorla koparma
      return
    }
    setCountdown(5)
    const t = window.setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null
        if (c <= 1) {
          hardReload()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [reloadNotice, voice.channelId])

  function selectChannel(id: string) {
    if (!id) {
      setMobileView('main') // Arkadaşlar sayfası
      return
    }
    const ch = channels.find((c) => c.id === id)
    if (!ch) return
    select(id, ch.kind === 'dm' ? 'dm' : 'server')
    setMobileView('main')
    if (ch.kind === 'voice' && voice.channelId !== id) voice.join(id)
  }

  // DM açılınca (profil kartından vb.) telefonda sohbete geç
  useEffect(() => {
    if (selectedId) setMobileView('main')
  }, [selectedId])

  const { friendships } = useApp()
  const incomingRequests = friendships.filter((f) => f.status === 'pending' && f.addressee === userId).length
  const dmUnread = dmChannels.reduce((a, c) => a + (unread[c.id] ?? 0), 0) + incomingRequests
  const serverUnread = serverChannels.reduce((a, c) => a + (unread[c.id] ?? 0), 0)
  const serverMentions = serverChannels.reduce((a, c) => a + (mentions[c.id] ?? 0), 0)

  return (
    <div className={`app mobile-${mobileView}`}>
      <nav className="server-rail">
        <button
          className={`rail-btn home${mode === 'dm' ? ' active' : ''}`}
          title="Doğrudan mesajlar"
          onClick={() => {
            setMode('dm')
            select(null, 'dm')
            setMobileView('nav')
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
          {serverUnread > 0 && mode !== 'server' && (
            <span className={`rail-badge${serverMentions ? '' : ' soft'}`}>{serverUnread > 99 ? '99+' : serverUnread}</span>
          )}
        </button>
      </nav>

      {mode === 'dm' ? (
        <DmSidebar currentId={current?.id ?? null} onSelect={selectChannel} unread={unread} onOpenSettings={setSettings} />
      ) : (
        <ChannelSidebar currentId={current?.id ?? null} onSelect={selectChannel} unread={unread} mentions={mentions} onOpenSettings={setSettings} onFriends={() => { select(null, 'dm'); setMobileView('main') }} />
      )}

      <main className="main">
        <button className="mobile-back" onClick={() => setMobileView('nav')} title="Geri"><Icon name="back" size={20} /></button>
        {current?.kind === 'voice' ? (
          <VoiceView channel={current} onToggleMembers={() => setShowMembers((s) => !s)} />
        ) : current ? (
          <ChatView key={current.id} channel={current} onToggleMembers={() => setShowMembers((s) => !s)} />
        ) : mode === 'dm' ? (
          <FriendsView />
        ) : (
          <div className="empty-state">Henüz kanal yok. Sunucu ayarlarından kanal ekleyebilirsin.</div>
        )}
      </main>

      {showMembers && (mode === 'dm' ? <FriendsActivity /> : <MemberList onOpenRevisions={() => setSettings('revisions')} />)}
      {settings && <SettingsModal initialTab={settings} onClose={() => setSettings(null)} />}
      {profileOf && <UserProfileModal userId={profileOf} onClose={() => openProfile(null)} onEditProfile={() => { openProfile(null); setSettings('profile') }} />}

      <UserContextMenu />
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
            <strong>{reloadNotice.forced ? 'CSN güncellendi.' : 'Yeni sürüm hazır.'}</strong>{' '}
            {reloadNotice.note && <span>{reloadNotice.note} · </span>}
            {countdown !== null
              ? `${countdown} saniye içinde yenileniyor…`
              : voice.channelId
                ? 'Sesli sohbettesin; hazır olduğunda yenile.'
                : 'Yeni özellikleri görmek için yenile.'}
          </div>
          <button className="btn primary small" onClick={hardReload}>Şimdi yenile</button>
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
