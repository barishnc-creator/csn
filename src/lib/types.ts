export type Role = 'admin' | 'mod' | 'member'
export type ChannelKind = 'text' | 'voice' | 'dm'
export type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible'

export interface Profile {
  id: string
  display_name: string
  avatar_path: string | null
  custom_status: string | null
  bio: string | null
  pronouns: string | null
  banner_color: string | null
  banner_path: string | null
  tag: number
  /** Yalnız botlarda: yöneticinin seçtiği aktiflik durumu */
  bot_presence?: UserStatus | null
}

export type Permission = 'manage_channels' | 'kick_members' | 'create_invites' | 'manage_messages' | 'mention_everyone' | 'submit_revisions' | 'manage_sounds'

export interface CustomRole {
  id: string
  name: string
  color: string
  permissions: Permission[]
  hoist: boolean
  position: number
}

export interface MemberRole {
  user_id: string
  role_id: string
}

export interface ChannelMember {
  channel_id: string
  user_id: string
}

export interface Reaction {
  message_id: number
  user_id: string
  emoji: string
}

export interface Member {
  user_id: string
  role: Role
  is_owner: boolean
  joined_at: string
}

export type RevisionStatus = 'pending' | 'approved' | 'rejected' | 'in_progress' | 'done'

export interface Revision {
  id: number
  title: string
  description: string
  status: RevisionStatus
  created_by: string
  created_at: string
  decided_by: string | null
  decided_at: string | null
  owner_note: string | null
  dev_note: string | null
  updated_at: string
}

export interface Channel {
  id: string
  name: string
  kind: ChannelKind
  topic: string | null
  position: number
  allowed_roles: string[] | null
  join_roles: string[] | null
  category_id: string | null
}

/** Revize #25: kanal kategorisi (metin ya da ses) */
export interface ChannelCategory {
  id: string
  name: string
  kind: 'text' | 'voice'
  position: number
}

export interface Attachment {
  path: string
  name: string
  size: number
  type: string
  /** Sesli mesaj: mikrofonla kaydedildi */
  voice?: boolean
  /** Sesli mesaj süresi (saniye) */
  duration?: number
  /** Sesli mesaj dalga biçimi: 0-1 arası çubuk yükseklikleri */
  waveform?: number[]
}

export interface Message {
  id: number
  channel_id: string
  author_id: string
  content: string
  attachments: Attachment[]
  reply_to: number | null
  edited_at: string | null
  created_at: string
  pinned_at: string | null
  pinned_by: string | null
}

export interface Invite {
  code: string
  created_by: string
  max_uses: number | null
  uses: number
  expires_at: string | null
  created_at: string
}

/** Supabase Presence'ta her kullanıcının paylaştığı durum */
export interface PresenceState {
  user_id: string
  status: UserStatus
  voice_channel_id: string | null
  muted: boolean
  deafened: boolean
  streaming: boolean
}

export interface Friendship {
  id: number
  requester: string
  addressee: string
  status: 'pending' | 'accepted'
  created_at: string
  accepted_at: string | null
}
