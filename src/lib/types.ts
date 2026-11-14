export type Role = 'admin' | 'mod' | 'member'
export type ChannelKind = 'text' | 'voice'
export type UserStatus = 'online' | 'idle' | 'dnd'

export interface Profile {
  id: string
  display_name: string
  avatar_path: string | null
  custom_status: string | null
}

export interface Member {
  user_id: string
  role: Role
  joined_at: string
}

export interface Channel {
  id: string
  name: string
  kind: ChannelKind
  topic: string | null
  position: number
}

export interface Attachment {
  path: string
  name: string
  size: number
  type: string
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
