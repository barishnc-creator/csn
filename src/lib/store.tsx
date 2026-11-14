import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { BUILD_ID, fetchLatestBuild, hardReload } from './version'
import type {
  Channel,
  ChannelMember,
  CustomRole,
  Friendship,
  Member,
  MemberRole,
  Permission,
  PresenceState,
  Profile,
  Role,
  UserStatus,
} from './types'

export type ViewMode = 'server' | 'dm'

export interface ReloadNotice {
  note: string | null
  by: string | null
  /** true: sahip "Herkesi yenile" dedi (otomatik yenilenir); false: yeni sürüm kendiliğinden fark edildi */
  forced: boolean
}

interface AppState {
  userId: string
  me: Profile | null
  myRole: Role
  isOwner: boolean
  profiles: Record<string, Profile>
  members: Member[]
  channels: Channel[]
  roles: CustomRole[]
  memberRoles: MemberRole[]
  dmMembers: ChannelMember[]
  friendships: Friendship[]
  /** none | friends | outgoing | incoming */
  friendState: (uid: string) => { state: 'none' | 'friends' | 'outgoing' | 'incoming'; id?: number }
  presence: Record<string, PresenceState>
  myStatus: UserStatus
  setMyStatus: (s: UserStatus) => void
  updatePresence: (patch: Partial<PresenceState>) => void
  refreshProfiles: () => Promise<void>
  /** Bu kullanıcının yetkisi var mı (yönetici her şeye sahip) */
  can: (perm: Permission, uid?: string) => boolean
  /** Kişinin özel rolleri, sıraya göre */
  rolesOf: (uid: string) => CustomRole[]
  /** İsmin rengi: en üstteki renkli rol */
  nameColor: (uid: string) => string | undefined
  /** DM kanalındaki diğer kişi */
  dmPartner: (channelId: string) => string | undefined
  // Gezinme
  mode: ViewMode
  selectedId: string | null
  select: (channelId: string | null, mode?: ViewMode) => void
  setMode: (m: ViewMode) => void
  openDm: (uid: string) => Promise<void>
  profileOf: string | null
  userMenu: { uid: string; x: number; y: number } | null
  openUserMenu: (uid: string | null, x?: number, y?: number) => void
  openProfile: (uid: string | null) => void
  reloadNotice: ReloadNotice | null
  dismissReload: () => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp, AppProvider dışında kullanıldı')
  return v
}

const STATUS_KEY = 'csn.status'
const LAST_KEY = 'csn.lastChannel'
const IDLE_MS = 10 * 60 * 1000

function readLS(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLS(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    // yoksay
  }
}

const sortChannels = (list: Channel[]) =>
  [...list].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'tr'))

export function AppProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [members, setMembers] = useState<Member[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [roles, setRoles] = useState<CustomRole[]>([])
  const [memberRoles, setMemberRoles] = useState<MemberRole[]>([])
  const [dmMembers, setDmMembers] = useState<ChannelMember[]>([])
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [presence, setPresence] = useState<Record<string, PresenceState>>({})
  const [mode, setMode] = useState<ViewMode>('server')
  const [selectedId, setSelectedId] = useState<string | null>(() => readLS(LAST_KEY))
  const [profileOf, setProfileOf] = useState<string | null>(null)
  const [userMenu, setUserMenu] = useState<{ uid: string; x: number; y: number } | null>(null)
  const [reloadNotice, setReloadNotice] = useState<ReloadNotice | null>(null)
  const reloadVersion = useRef<number | null>(null)
  const [myStatus, setMyStatusState] = useState<UserStatus>(() => (readLS(STATUS_KEY) === 'dnd' ? 'dnd' : 'online'))
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
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_path, custom_status, bio, pronouns, banner_color, banner_path, tag')
    if (data) setProfiles(Object.fromEntries(data.map((p) => [p.id, p as Profile])))
  }, [])

  const refreshChannels = useCallback(async () => {
    const [c, cm] = await Promise.all([
      supabase.from('channels').select('id, name, kind, topic, position, allowed_roles'),
      supabase.from('channel_members').select('channel_id, user_id'),
    ])
    if (c.data) setChannels(sortChannels(c.data as Channel[]))
    if (cm.data) setDmMembers(cm.data as ChannelMember[])
  }, [])

  const refreshRoles = useCallback(async () => {
    const [r, mr] = await Promise.all([
      supabase.from('roles').select('id, name, color, permissions, hoist, position').order('position'),
      supabase.from('member_roles').select('user_id, role_id'),
    ])
    if (r.data) setRoles(r.data as CustomRole[])
    if (mr.data) setMemberRoles(mr.data as MemberRole[])
  }, [])

  const refreshFriends = useCallback(async () => {
    const { data } = await supabase.from('friendships').select('id, requester, addressee, status, created_at, accepted_at')
    if (data) setFriendships(data as Friendship[])
  }, [])

  // İlk yükleme + canlı güncellemeler
  useEffect(() => {
    let alive = true
    const load = async () => {
      const [m, st] = await Promise.all([
        supabase.from('members').select('user_id, role, is_owner, joined_at'),
        supabase.from('server_state').select('reload_version').maybeSingle(),
        refreshChannels(),
        refreshRoles(),
        refreshProfiles(),
        refreshFriends(),
      ])
      if (!alive) return
      if (m.data) setMembers(m.data as Member[])
      reloadVersion.current = st.data?.reload_version ?? 0
    }
    load()

    const db = supabase
      .channel('csn-db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => refreshChannels())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_members' }, () => refreshChannels())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles' }, () => refreshRoles())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => refreshFriends())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_roles' }, () => {
        refreshRoles()
        refreshChannels() // gizli kanal erişimi değişmiş olabilir
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (p) => {
        if (p.eventType === 'DELETE' && (p.old as Member).user_id === userId) {
          // Sunucudan çıkarıldım
          hardReload()
          return
        }
        setMembers((prev) => {
          if (p.eventType === 'DELETE') return prev.filter((m) => m.user_id !== (p.old as Member).user_id)
          const row = p.new as Member
          return [...prev.filter((m) => m.user_id !== row.user_id), row]
        })
        if (p.eventType === 'INSERT') refreshProfiles()
        if (p.eventType === 'UPDATE') refreshChannels()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
        const row = p.new as Profile
        setProfiles((prev) => ({ ...prev, [row.id]: row }))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'server_state' }, (p) => {
        const row = p.new as { reload_version: number; reload_note: string | null; reloaded_by: string | null }
        if (reloadVersion.current !== null && row.reload_version > reloadVersion.current) {
          reloadVersion.current = row.reload_version
          setReloadNotice({ note: row.reload_note, by: row.reloaded_by, forced: true })
        }
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(db)
    }
  }, [refreshProfiles, refreshChannels, refreshRoles, refreshFriends, userId])

  // Yeni sürüm denetimi: dakikada bir ve pencereye dönüldüğünde
  useEffect(() => {
    if (BUILD_ID.startsWith('dev-')) return
    let stopped = false
    const check = async () => {
      const latest = await fetchLatestBuild()
      if (!stopped && latest && latest !== BUILD_ID) {
        setReloadNotice((cur) => cur ?? { note: null, by: null, forced: false })
      }
    }
    const t = window.setInterval(check, 60_000)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    check()
    return () => {
      stopped = true
      window.clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

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
    writeLS(STATUS_KEY, s)
  }, [])

  const select = useCallback((id: string | null, m?: ViewMode) => {
    setSelectedId(id)
    if (m) setMode(m)
    if (id) writeLS(LAST_KEY, id)
  }, [])

  const openDm = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase.rpc('open_dm', { other: uid })
      if (error || !data) return
      await refreshChannels()
      setProfileOf(null)
      select(data as string, 'dm')
    },
    [refreshChannels, select],
  )

  const value = useMemo<AppState>(() => {
    const me = members.find((m) => m.user_id === userId)
    const roleById = new Map(roles.map((r) => [r.id, r]))
    const rolesOf = (uid: string) =>
      memberRoles
        .filter((mr) => mr.user_id === uid)
        .map((mr) => roleById.get(mr.role_id))
        .filter((r): r is CustomRole => !!r)
        .sort((a, b) => a.position - b.position)
    const can = (perm: Permission, uid = userId) => {
      const m = members.find((x) => x.user_id === uid)
      if (!m) return false
      if (m.role === 'admin') return true
      if (m.role === 'mod' && ['create_invites', 'manage_messages', 'mention_everyone'].includes(perm)) return true
      return rolesOf(uid).some((r) => r.permissions.includes(perm))
    }
    return {
      userId,
      me: profiles[userId] ?? null,
      myRole: me?.role ?? 'member',
      isOwner: me?.is_owner ?? false,
      profiles,
      members,
      channels,
      roles,
      memberRoles,
      dmMembers,
      friendships,
      friendState: (uid) => {
        const f = friendships.find((x) => (x.requester === uid && x.addressee === userId) || (x.addressee === uid && x.requester === userId))
        if (!f) return { state: 'none' }
        if (f.status === 'accepted') return { state: 'friends', id: f.id }
        return { state: f.requester === userId ? 'outgoing' : 'incoming', id: f.id }
      },
      presence,
      myStatus: effectiveStatus,
      setMyStatus,
      updatePresence,
      refreshProfiles,
      can,
      rolesOf,
      nameColor: (uid) => rolesOf(uid).find((r) => r.color && r.color !== '#99aab5')?.color,
      dmPartner: (cid) => dmMembers.find((d) => d.channel_id === cid && d.user_id !== userId)?.user_id,
      mode,
      selectedId,
      select,
      setMode,
      openDm,
      profileOf,
      openProfile: setProfileOf,
      userMenu,
      openUserMenu: (uid, x = 0, y = 0) => setUserMenu(uid ? { uid, x, y } : null),
      reloadNotice,
      dismissReload: () => setReloadNotice(null),
    }
  }, [
    userId, profiles, members, channels, roles, memberRoles, dmMembers, friendships, presence, effectiveStatus,
    setMyStatus, updatePresence, refreshProfiles, mode, selectedId, select, openDm, profileOf, userMenu, reloadNotice,
  ])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
