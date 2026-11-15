import type { UserStatus } from './types'

export const STATUS_OPTIONS: { id: UserStatus; label: string; hint: string }[] = [
  { id: 'online', label: 'Çevrimiçi', hint: 'Herkes seni çevrimiçi görür' },
  { id: 'idle', label: 'Dışarıda', hint: 'Sarı nokta: biraz uzaktasın' },
  { id: 'dnd', label: 'Rahatsız etmeyin', hint: 'Bildirim ve ses gelmez' },
  { id: 'invisible', label: 'Çevrimdışı görün', hint: 'Başkaları seni çevrimdışı görür' },
]

export const statusLabel = (s: UserStatus) => STATUS_OPTIONS.find((o) => o.id === s)?.label ?? 'Çevrimiçi'
