// Mesaj kutusundaki müzik komutları: /çal, /geç, /dur, /devam, /durdur, /sıra
import { enqueue, fetchTitle, parseYouTubeId, pause, resume, skip, stop, music, setLoop, LOOP_LABEL, LOOP_ORDER, type LoopMode } from './music'

export interface CommandResult {
  /** false: komut değil, normal mesaj olarak gönderilsin */
  handled: boolean
  ok?: boolean
  message?: string
}

const ALIASES: Record<string, 'play' | 'skip' | 'pause' | 'resume' | 'stop' | 'queue' | 'loop' | 'volume'> = {
  tekrar: 'loop',
  tekrarla: 'loop',
  loop: 'loop',
  repeat: 'loop',
  ses: 'volume',
  volume: 'volume',
  vol: 'volume',
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

export const MUSIC_HELP = '/çal <YouTube bağlantısı>, /geç, /dur, /devam, /durdur, /sıra, /tekrar [kapalı|sıra|parça], /ses <0-100>'

export async function runMusicCommand(
  text: string,
  ctx: { voiceChannelId: string | null; userId: string; textChannelId?: string | null },
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
        const r = await enqueue(ch, { videoId, title, addedBy: ctx.userId }, ctx.textChannelId)
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
      case 'loop': {
        const row = music.getSnapshot().channelId === ch ? music.getSnapshot().row : null
        const a = arg.toLocaleLowerCase('tr')
        const map: Record<string, LoopMode> = { kapalı: 'off', kapali: 'off', off: 'off', sıra: 'all', sira: 'all', hepsi: 'all', all: 'all', parça: 'one', parca: 'one', tek: 'one', one: 'one' }
        const cur = row?.loop ?? 'off'
        const mode = map[a] ?? LOOP_ORDER[(LOOP_ORDER.indexOf(cur) + 1) % LOOP_ORDER.length]
        await setLoop(ch, mode)
        return { handled: true, ok: true, message: `🔁 ${LOOP_LABEL[mode]}` }
      }
      case 'volume': {
        const v = Number(arg.replace('%', ''))
        if (!arg || !Number.isFinite(v)) return { handled: true, ok: true, message: `🔊 Müzik sesi: %${music.getSnapshot().volume} (yalnız sende)` }
        music.setVolume(v)
        return { handled: true, ok: true, message: `🔊 Müzik sesi %${music.getSnapshot().volume} (yalnız sende)` }
      }
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
