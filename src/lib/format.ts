const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })

export function formatTime(iso: string) {
  return timeFmt.format(new Date(iso))
}

export function formatDay(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Bugün'
  if (d.toDateString() === yesterday.toDateString()) return 'Dün'
  return dateFmt.format(d)
}

export function formatStamp(iso: string) {
  const day = formatDay(iso)
  return `${day} ${formatTime(iso)}`
}

/** Baş harflerden avatar yazısı */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** İsimden sabit renk */
export function colorFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 55% 45%)`
}
