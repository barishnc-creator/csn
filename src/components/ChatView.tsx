import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { formatDay } from '../lib/format'
import type { Channel, Message } from '../lib/types'
import Icon from './Icon'
import MessageItem from './MessageItem'
import Composer from './Composer'

const PAGE = 50
const GROUP_MS = 5 * 60 * 1000

export default function ChatView({ channel, onToggleMembers }: { channel: Channel; onToggleMembers: () => void }) {
  const { userId, myRole } = useApp()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const prevHeight = useRef<number | null>(null)

  // İlk sayfa + canlı akış
  useEffect(() => {
    let alive = true
    setLoading(true)
    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .order('id', { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        if (!alive) return
        const rows = (data ?? []) as Message[]
        setMessages(rows.reverse())
        setHasMore(rows.length === PAGE)
        setLoading(false)
        stickToBottom.current = true
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
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(sub)
    }
  }, [channel.id])

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
  }, [hasMore, loading, messages, channel.id])

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

  const canModerate = myRole === 'admin' || myRole === 'mod'

  return (
    <div className="chat">
      <header className="main-header">
        <Icon name="hash" size={22} className="header-icon" />
        <span className="header-title">{channel.name}</span>
        {channel.topic && <span className="header-topic">{channel.topic}</span>}
        <div className="header-actions">
          <button className="icon-btn" onClick={onToggleMembers} title="Üye listesi">
            <Icon name="users" />
          </button>
        </div>
      </header>

      <div className="messages" ref={scroller} onScroll={onScroll}>
        {!hasMore && (
          <div className="channel-intro">
            <div className="channel-intro-icon"><Icon name="hash" size={36} /></div>
            <h2>#{channel.name} kanalına hoş geldin!</h2>
            <p className="muted">Bu kanalın başlangıcı.</p>
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
            <div key={m.id}>
              {newDay && (
                <div className="day-divider">
                  <span>{formatDay(m.created_at)}</span>
                </div>
              )}
              <MessageItem
                message={m}
                grouped={grouped}
                replied={m.reply_to ? byId.get(m.reply_to) ?? null : null}
                editing={editingId === m.id}
                canDelete={m.author_id === userId || canModerate}
                onReply={() => setReplyTo(m)}
                onEdit={() => setEditingId(m.id)}
                onEditDone={() => setEditingId(null)}
              />
            </div>
          )
        })}
      </div>

      <Composer
        channel={channel}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
        onEditLast={editLast}
      />
    </div>
  )
}
