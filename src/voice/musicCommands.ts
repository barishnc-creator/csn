// Mesaj kutusundaki müzik komutları: /çal, /geç, /dur, /devam, /durdur, /sıra
import { enqueue, fetchTitle, parseYouTubeId, pause, resume, skip, stop, music } from './music'

export interface CommandResult {
  /** false: komut değil, normal mesaj olarak gönderilsin */
  handled: boolean
  ok?: boolean
  message?: string
}

const ALIASES: Record<string, 'play' | 'skip' | 'pause' | 'resume' | 'stop' | 'queue'> = {
  'çal': 'play',
  cal: 'play',
  play: 'play',
  p: 'play',
  'geç': 'skip',
  gec: 'skip',
  skip: 'skip',
  dur: 'pause',
  pause: 'pause',
  devam: 'resume',
  resume: 'resume',
  durdur: 'stop',
  stop: 'stop',
  'sıra': 'queue',
  sira: 'queue',
  queue: 'queue',
  q: 'queue',
}

export const MUSIC_HELP = '/çal <YouTube bağlantısı>, /geç, /dur, /devam, /durdur, /sıra'

export async function runMusicCommand(
  text: string,
  ctx: { voiceChannelId: string | null; userId: string },
): Promise<CommandResult> {
  const m = text.trim().match(/^\/(\S+)\s*([\s\S]*)$/)
  if (!m) return { handled: false }
  const cmd = ALIASES[m[1].toLocaleLowerCase('tr')]
  if (!cmd) return { handled: false }
  const arg = m[2].trim()
  const ch = ctx.voiceChannelId
  if (!ch) return { handled: true, ok: false, message: 'Önce bir ses kanalına katıl' }

  try {
    switch (cmd) {
      case 'play': {
        if (!arg) return { handled: true, ok: false, message: 'Kullanım: /çal <YouTube bağlantısı>' }
        const videoId = parseYouTubeId(arg)
        if (!videoId) return { handled: true, ok: false, message: 'Geçerli bir YouTube bağlantısı değil' }
        const title = await fetchTitle(videoId)
        const r = await enqueue(ch, { videoId, title, addedBy: ctx.userId })
        return { handled: true, ok: true, message: r === 'playing' ? `🎵 Çalıyor: ${title}` : `🎵 Sıraya eklendi: ${title}` }
      }
      case 'skip': {
        const nextItem = await skip(ch)
        return { handled: true, ok: true, message: nextItem ? `⏭ Geçildi, şimdi: ${nextItem.title}` : '⏭ Geçildi, sıra boş' }
      }
      case 'pause':
        await pause(ch)
        return { handled: true, ok: true, message: '⏸ Duraklatıldı' }
      case 'resume':
        await resume(ch)
        return { handled: true, ok: true, message: '▶ Devam ediyor' }
      case 'stop':
        await stop(ch)
        return { handled: true, ok: true, message: '⏹ Müzik durduruldu, sıra temizlendi' }
      case 'queue': {
        const row = music.getSnapshot().channelId === ch ? music.getSnapshot().row : null
        if (!row?.current) return { handled: true, ok: true, message: 'Şu an müzik çalmıyor' }
        const list = row.queue
          .slice(0, 5)
          .map((q, i) => `${i + 1}. ${q.title}`)
          .join(' · ')
        const more = row.queue.length > 5 ? ` (+${row.queue.length - 5})` : ''
        return {
          handled: true,
          ok: true,
          message: `🎵 Şimdi: ${row.current.title}${list ? ` | Sırada: ${list}${more}` : ' | Sıra boş'}`,
        }
      }
    }
  } catch (e) {
    return { handled: true, ok: false, message: (e as Error).message || 'Komut çalıştırılamadı' }
  }
  return { handled: false }
}
