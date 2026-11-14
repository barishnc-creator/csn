import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'
import { useVoice } from '../voice/VoiceContext'
import { playSound } from '../voice/sounds'
import ChannelSidebar from './ChannelSidebar'
import ChatView from './ChatView'
import MemberList from './MemberList'
import VoiceView from './VoiceView'
import SettingsModal, { type SettingsTab } from './SettingsModal'

const LAST_KEY = 'csn.lastChannel'

export default function Layout() {
  const { channels, userId, profiles, me, myStatus } = useApp()
  const voice = useVoice()
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_KEY)
    } catch {
      return null
    }
  })
  const [showMembers, setShowMembers] = useState(true)
  const [settings, setSettings] = useState<SettingsTab | null>(null)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [mentions, setMentions] = useState<Record<string, number>>({})

  const current = channels.find((c) => c.id === selected) ?? channels.find((c) => c.kind === 'text') ?? null
  const currentRef = useRef(current?.id)
  currentRef.current = current?.id

  useEffect(() => {
    if (!current) return
    try {
      localStorage.setItem(LAST_KEY, current.id)
    } catch {
      // yoksay
    }
    setUnread((u) => ({ ...u, [current.id]: 0 }))
    setMentions((m) => ({ ...m, [current.id]: 0 }))
  }, [current?.id])

  // Masaüstü bildirim izni
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }, [])

  // Başka kanallardaki yeni mesajlar → okunmamış sayacı + bildirim
  const myName = me?.display_name
  useEffect(() => {
    const ch = supabase
      .channel('csn-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const msg = p.new as Message
        if (msg.author_id === userId) return
        const mentioned = !!myName && (msg.content.includes(`@${myName}`) || msg.content.includes('@herkes'))
        const visible = msg.channel_id === currentRef.current && document.hasFocus()
        if (!visible) {
          setUnread((u) => ({ ...u, [msg.channel_id]: (u[msg.channel_id] ?? 0) + 1 }))
          if (mentioned) setMentions((m) => ({ ...m, [msg.channel_id]: (m[msg.channel_id] ?? 0) + 1 }))
        }
        if (myStatus === 'dnd' || visible) return
        if (mentioned || msg.channel_id === currentRef.current) playSound('message')
        if (mentioned && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const author = profiles[msg.author_id]?.display_name ?? 'Biri'
          new Notification(`${author} senden bahsetti`, { body: msg.content.slice(0, 140), tag: `csn-${msg.id}` })
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [userId, myName, myStatus, profiles])

  // Pencere başlığında okunmamış bahsetme sayısı
  const totalMentions = Object.values(mentions).reduce((a, b) => a + b, 0)
  useEffect(() => {
    document.title = totalMentions ? `(${totalMentions}) CSN` : 'CSN'
  }, [totalMentions])

  function select(id: string) {
    const ch = channels.find((c) => c.id === id)
    if (!ch) return
    setSelected(id)
    if (ch.kind === 'voice' && voice.channelId !== id) voice.join(id)
  }

  return (
    <div className="app">
      <nav className="server-rail">
        <div className="server-icon active" title="CSN">CSN</div>
      </nav>
      <ChannelSidebar
        currentId={current?.id ?? null}
        onSelect={select}
        unread={unread}
        mentions={mentions}
        onOpenSettings={(tab) => setSettings(tab)}
      />
      <main className="main">
        {current?.kind === 'voice' ? (
          <VoiceView channel={current} onToggleMembers={() => setShowMembers((s) => !s)} />
        ) : current ? (
          <ChatView key={current.id} channel={current} onToggleMembers={() => setShowMembers((s) => !s)} />
        ) : (
          <div className="empty-state">Henüz kanal yok. Sunucu ayarlarından kanal ekleyebilirsin.</div>
        )}
      </main>
      {showMembers && current?.kind !== 'voice' && <MemberList />}
      {settings && <SettingsModal initialTab={settings} onClose={() => setSettings(null)} />}
      {voice.error && (
        <div className="toast error" onClick={voice.clearError}>
          {voice.error}
          <span className="toast-close">×</span>
        </div>
      )}
    </div>
  )
}
