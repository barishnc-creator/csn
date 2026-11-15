import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { formatDay, formatStamp } from '../lib/format'
import type { Channel, Message, Reaction } from '../lib/types'
import { useVoice } from '../voice/VoiceContext'
import Avatar from './Avatar'
import Icon from './Icon'
import MessageItem from './MessageItem'
import Composer from './Composer'
import { CallStage } from './VoiceView'
import { isGifMessage } from './GifPicker'
import { stickerIdOf } from '../lib/stickers'
import MusicConsole from './MusicConsole'

const PAGE = 50
const GROUP_MS = 5 * 60 * 1000

type Panel = 'pins' | 'search' | null

export default function ChatView({ channel, onToggleMembers }: { channel: Channel; onToggleMembers: () => void }) {
  const { userId, can, dmPartner, profiles, presence, openProfile, canJoin } = useApp()
  const voice = useVoice()
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [highlight, setHighlight] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const prevHeight = useRef<number | null>(null)

  const isDm = channel.kind === 'dm'
  const partner = isDm ? dmPartner(channel.id) : undefined
  const partnerProfile = partner ? profiles[partner] : undefined
  const title = isDm ? partnerProfile?.display_name ?? 'Özel mesaj' : channel.name
  const inCall = voice.channelId === channel.id
  const partnerInCall = isDm && Object.values(presence).some((p) => p.user_id !== userId && p.voice_channel_id === channel.id)

  const loadReactions = useCallback(async (ids: number[]) => {
    if (!ids.length) return
    const { data } = await supabase.from('reactions').select('message_id, user_id, emoji').in('message_id', ids)
    if (data) {
      const set = new Set(ids)
      setReactions((prev) => [...prev.filter((r) => !set.has(r.message_id)), ...(data as Reaction[])])
    }
  }, [])

  // İlk sayfa + canlı akış
  useEffect(() => {
    let alive = true
    setLoading(true)
    setReactions([])
    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .order('id', { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        if (!alive) return
        const rows = ((data ?? []) as Message[]).reverse()
        setMessages(rows)
        setHasMore(rows.length === PAGE)
        setLoading(false)
        stickToBottom.current = true
        loadReactions(rows.map((m) => m.id))
      })

    const sub = supabase
      .channel(`chat-${channel.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel.id}` },
        (p) => {
          if (p.eventType === 'INSERT') {
            const row = p.new as Message
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
          } else if (p.eventType === 'UPDATE') {
            const row = p.new as Message
            setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)))
          } else if (p.eventType === 'DELETE') {
            const id = (p.old as { id: number }).id
            setMessages((prev) => prev.filter((m) => m.id !== id))
          }
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (p) => {
        if (p.eventType === 'INSERT') {
          const r = p.new as Reaction
          setReactions((prev) =>
            prev.some((x) => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji) ? prev : [...prev, r],
          )
        } else if (p.eventType === 'DELETE') {
          const r = p.old as Reaction
          setReactions((prev) => prev.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)))
        }
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(sub)
    }
  }, [channel.id, loadReactions])

  const loadOlder = useCallback(async () => {
    if (!hasMore || loading || messages.length === 0) return
    setLoading(true)
    prevHeight.current = scroller.current?.scrollHeight ?? null
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .lt('id', messages[0].id)
      .order('id', { ascending: false })
      .limit(PAGE)
    const rows = ((data ?? []) as Message[]).reverse()
    setMessages((prev) => [...rows, ...prev])
    setHasMore(rows.length === PAGE)
    setLoading(false)
    loadReactions(rows.map((m) => m.id))
  }, [hasMore, loading, messages, channel.id, loadReactions])

  // Kaydırma konumunu koru
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current
      prevHeight.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 200) loadOlder()
  }

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])
  const reactionsByMsg = useMemo(() => {
    const map = new Map<number, Reaction[]>()
    for (const r of reactions) map.set(r.message_id, [...(map.get(r.message_id) ?? []), r])
    return map
  }, [reactions])

  async function send(content: string, attachments: Message['attachments']) {
    stickToBottom.current = true
    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id: channel.id, content, attachments, reply_to: replyTo?.id ?? null })
      .select()
      .single()
    if (error) throw error
    setReplyTo(null)
    if (data) setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]))
  }

  function editLast() {
    const mine = [...messages].reverse().find((m) => m.author_id === userId)
    if (mine) setEditingId(mine.id)
  }

  function jumpTo(id: number) {
    const el = document.getElementById(`msg-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlight(id)
      window.setTimeout(() => setHighlight(null), 1800)
    }
  }

  const canModerate = !isDm && can('manage_messages')
  const canPin = isDm || can('manage_messages')

  return (
    <div className="chat-layout">
      <div className="chat">
        <header className="main-header">
          {isDm && partner ? (
            <button className="header-user" onClick={() => openProfile(partner)}>
              <Avatar profile={partnerProfile} userId={partner} size={26} status={presence[partner]?.status ?? 'offline'} />
              <span className="header-title">{title}</span>
            </button>
          ) : (
            <>
              <Icon name="hash" size={22} className="header-icon" />
              <span className="header-title">{title}</span>
              {channel.topic && <span className="header-topic">{channel.topic}</span>}
            </>
          )}
          <div className="header-actions">
            {isDm && !inCall && (
              <button className={`icon-btn${partnerInCall ? ' pulse' : ''}`} title={partnerInCall ? 'Görüşmeye katıl' : 'Sesli ara'} onClick={() => voice.join(channel.id)} disabled={voice.connecting}>
                <Icon name="phone" />
              </button>
            )}
            <button className={`icon-btn${panel === 'pins' ? ' active' : ''}`} onClick={() => setPanel(panel === 'pins' ? null : 'pins')} title="Sabitlenen mesajlar">
              <Icon name="pin" />
            </button>
            <button className={`icon-btn${panel === 'search' ? ' active' : ''}`} onClick={() => setPanel(panel === 'search' ? null : 'search')} title="Mesajlarda ara">
              <Icon name="search" />
            </button>
            <button className="icon-btn" onClick={onToggleMembers} title="Üye panelini aç/kapat">
              <Icon name="users" />
            </button>
          </div>
        </header>

        {inCall && (
          <div className="dm-call">
            <CallStage compact />
          </div>
        )}

        {channel.kind !== 'dm' && <MusicConsole textChannelId={channel.id} />}

        <div className="messages" ref={scroller} onScroll={onScroll}>
          {!hasMore && (
            <div className="channel-intro">
              {isDm && partner ? (
                <>
                  <Avatar profile={partnerProfile} userId={partner} size={80} />
                  <h2>{title}</h2>
                  <p className="muted">{title} ile özel mesajlaşmanın başlangıcı. Bu konuşmayı yalnız ikiniz görebilirsiniz.</p>
                </>
              ) : (
                <>
                  <div className="channel-intro-icon"><Icon name="hash" size={36} /></div>
                  <h2>#{channel.name} kanalına hoş geldin!</h2>
                  <p className="muted">Bu kanalın başlangıcı.</p>
                </>
              )}
            </div>
          )}
          {loading && messages.length === 0 && <div className="spinner centered" />}
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const newDay = !prev || formatDay(prev.created_at) !== formatDay(m.created_at)
            const grouped =
              !!prev &&
              !newDay &&
              !m.reply_to &&
              prev.author_id === m.author_id &&
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS
            return (
              <div key={m.id} id={`msg-${m.id}`} className={highlight === m.id ? 'flash' : undefined}>
                {newDay && (
                  <div className="day-divider">
                    <span>{formatDay(m.created_at)}</span>
                  </div>
                )}
                <MessageItem
                  message={m}
                  grouped={grouped}
                  replied={m.reply_to ? byId.get(m.reply_to) ?? null : null}
                  reactions={reactionsByMsg.get(m.id)}
                  editing={editingId === m.id}
                  canDelete={m.author_id === userId || canModerate}
                  canPin={canPin}
                  onReply={() => setReplyTo(m)}
                  onEdit={() => setEditingId(m.id)}
                  onEditDone={() => setEditingId(null)}
                  onJump={jumpTo}
                />
              </div>
            )
          })}
        </div>

        {!canJoin(channel) ? (
          <div className="readonly-bar"><Icon name="lock" size={16} /> Bu kanalda yalnız okuma iznin var.</div>
        ) : (
        <Composer
          channel={channel}
          placeholder={isDm ? `@${title} kişisine mesaj gönder` : `#${channel.name} kanalına mesaj gönder`}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={send}
          onEditLast={editLast}
        />
        )}
      </div>

      {panel === 'pins' && <PinsPanel channelId={channel.id} onClose={() => setPanel(null)} onJump={jumpTo} />}
      {panel === 'search' && <SearchPanel channelId={channel.id} onClose={() => setPanel(null)} onJump={jumpTo} />}
    </div>
  )
}

function SidePanel({ title, icon, onClose, children }: { title: string; icon: 'pin' | 'search'; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="side-panel">
      <header className="side-panel-head">
        <Icon name={icon} size={18} />
        <span>{title}</span>
        <button className="icon-btn" onClick={onClose} title="Kapat"><Icon name="x" size={18} /></button>
      </header>
      <div className="side-panel-body">{children}</div>
    </aside>
  )
}

function MiniMessage({ m, onJump }: { m: Message; onJump: (id: number) => void }) {
  const { profiles } = useApp()
  return (
    <button className="mini-msg" onClick={() => onJump(m.id)} title="Mesaja git">
      <Avatar profile={profiles[m.author_id]} userId={m.author_id} size={28} />
      <div className="mini-msg-body">
        <div>
          <strong>{profiles[m.author_id]?.display_name ?? 'Üye'}</strong> <span className="muted small">{formatStamp(m.created_at)}</span>
        </div>
        <div className="mini-msg-text">{isGifMessage(m.content) ? '🎞️ GIF' : stickerIdOf(m.content) ? '🏷️ Sticker' : m.content || (m.attachments.length ? '📎 Ek dosya' : '')}</div>
      </div>
    </button>
  )
}

function PinsPanel({ channelId, onClose, onJump }: { channelId: string; onClose: () => void; onJump: (id: number) => void }) {
  const [pins, setPins] = useState<Message[] | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .not('pinned_at', 'is', null)
        .order('pinned_at', { ascending: false })
        .then(({ data }) => alive && setPins((data ?? []) as Message[]))
    load()
    const ch = supabase
      .channel(`pins-${channelId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, load)
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [channelId])
  return (
    <SidePanel title="Sabitlenen mesajlar" icon="pin" onClose={onClose}>
      {pins === null && <div className="spinner centered" />}
      {pins?.length === 0 && <p className="muted small panel-empty">Bu kanalda sabitlenmiş mesaj yok. Bir mesajın üzerine gelip 📌 simgesine basarak sabitleyebilirsin.</p>}
      {pins?.map((m) => <MiniMessage key={m.id} m={m} onJump={onJump} />)}
    </SidePanel>
  )
}

function SearchPanel({ channelId, onClose, onJump }: { channelId: string; onClose: () => void; onJump: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Message[] | null>(null)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults(null)
      return
    }
    let alive = true
    const t = window.setTimeout(async () => {
      const safe = term.replace(/[%_,()]/g, ' ')
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .ilike('content', `%${safe}%`)
        .order('id', { ascending: false })
        .limit(50)
      if (alive) setResults((data ?? []) as Message[])
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [q, channelId])
  return (
    <SidePanel title="Mesajlarda ara" icon="search" onClose={onClose}>
      <input className="panel-search" autoFocus placeholder="Aranacak kelime…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results === null && <p className="muted small panel-empty">En az 2 harf yaz.</p>}
      {results?.length === 0 && <p className="muted small panel-empty">Sonuç yok.</p>}
      {results && results.length > 0 && <p className="muted small panel-empty">{results.length} sonuç{results.length === 50 ? ' (ilk 50)' : ''}</p>}
      {results?.map((m) => <MiniMessage key={m.id} m={m} onJump={onJump} />)}
    </SidePanel>
  )
}
