import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Channel, Member, PresenceState, Profile, Role, UserStatus } from './types'

interface AppState {
  userId: string
  me: Profile | null
  myRole: Role
  isOwner: boolean
  profiles: Record<string, Profile>
  members: Member[]
  channels: Channel[]
  presence: Record<string, PresenceState>
  myStatus: UserStatus
  setMyStatus: (s: UserStatus) => void
  updatePresence: (patch: Partial<PresenceState>) => void
  refreshProfiles: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp, AppProvider dışında kullanıldı')
  return v
}

const STATUS_KEY = 'csn.status'
const IDLE_MS = 10 * 60 * 1000

export function AppProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [members, setMembers] = useState<Member[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [presence, setPresence] = useState<Record<string, PresenceState>>({})
  const [myStatus, setMyStatusState] = useState<UserStatus>(() => {
    try {
      const s = localStorage.getItem(STATUS_KEY)
      return s === 'dnd' ? 'dnd' : 'online'
    } catch {
      return 'online'
    }
  })
  const [idle, setIdle] = useState(false)

  const presenceRef = useRef<RealtimeChannel | null>(null)
  const myPresence = useRef<PresenceState>({
    user_id: userId,
    status: myStatus,
    voice_channel_id: null,
    muted: false,
    deafened: false,
    streaming: false,
  })

  const refreshProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, display_name, avatar_path, custom_status')
    if (data) setProfiles(Object.fromEntries(data.map((p) => [p.id, p as Profile])))
  }, [])

  // İlk yükleme + canlı güncellemeler
  useEffect(() => {
    let alive = true
    const load = async () => {
      const [m, c] = await Promise.all([
        supabase.from('members').select('user_id, role, is_owner, joined_at'),
        supabase.from('channels').select('id, name, kind, topic, position').order('position'),
      ])
      if (!alive) return
      if (m.data) setMembers(m.data as Member[])
      if (c.data) setChannels(c.data as Channel[])
      await refreshProfiles()
    }
    load()

    const db = supabase
      .channel('csn-db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, (p) => {
        setChannels((prev) => {
          if (p.eventType === 'DELETE') return prev.filter((c) => c.id !== (p.old as Channel).id)
          const row = p.new as Channel
          const rest = prev.filter((c) => c.id !== row.id)
          return [...rest, row].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (p) => {
        if (p.eventType === 'DELETE' && (p.old as Member).user_id === userId) {
          // Sunucudan çıkarıldım
          window.location.reload()
          return
        }
        setMembers((prev) => {
          if (p.eventType === 'DELETE') return prev.filter((m) => m.user_id !== (p.old as Member).user_id)
          const row = p.new as Member
          return [...prev.filter((m) => m.user_id !== row.user_id), row]
        })
        if (p.eventType === 'INSERT') refreshProfiles()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
        const row = p.new as Profile
        setProfiles((prev) => ({ ...prev, [row.id]: row }))
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(db)
    }
  }, [refreshProfiles, userId])

  // Presence: kim çevrimiçi, kim hangi ses kanalında
  useEffect(() => {
    const ch = supabase.channel('csn-presence', { config: { presence: { key: userId } } })
    presenceRef.current = ch
    const sync = () => {
      const state = ch.presenceState<PresenceState>()
      const next: Record<string, PresenceState> = {}
      for (const [key, metas] of Object.entries(state)) {
        // Aynı kişi birden fazla sekmede: ses kanalında olanı tercih et
        const best = metas.find((m) => m.voice_channel_id) ?? metas[metas.length - 1]
        if (best) next[key] = { ...best, user_id: key }
      }
      setPresence(next)
    }
    ch.on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await ch.track(myPresence.current)
      })
    return () => {
      presenceRef.current = null
      supabase.removeChannel(ch)
    }
  }, [userId])

  const updatePresence = useCallback((patch: Partial<PresenceState>) => {
    myPresence.current = { ...myPresence.current, ...patch }
    presenceRef.current?.track(myPresence.current)
  }, [])

  // Hareketsizlikte "boşta"
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS)
    const onActivity = () => {
      window.clearTimeout(timer)
      setIdle(false)
      timer = window.setTimeout(() => setIdle(true), IDLE_MS)
    }
    const events = ['mousemove', 'keydown', 'mousedown', 'focus'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [])

  const effectiveStatus: UserStatus = myStatus === 'dnd' ? 'dnd' : idle ? 'idle' : 'online'
  useEffect(() => {
    updatePresence({ status: effectiveStatus })
  }, [effectiveStatus, updatePresence])

  const setMyStatus = useCallback((s: UserStatus) => {
    setMyStatusState(s)
    try {
      localStorage.setItem(STATUS_KEY, s)
    } catch {
      // yoksay
    }
  }, [])

  const value = useMemo<AppState>(
    () => ({
      userId,
      me: profiles[userId] ?? null,
      myRole: members.find((m) => m.user_id === userId)?.role ?? 'member',
      isOwner: members.find((m) => m.user_id === userId)?.is_owner ?? false,
      profiles,
      members,
      channels,
      presence,
      myStatus: effectiveStatus,
      setMyStatus,
      updatePresence,
      refreshProfiles,
    }),
    [userId, profiles, members, channels, presence, effectiveStatus, setMyStatus, updatePresence, refreshProfiles],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
