// Küçük arayüz sesleri (dosya yok, Web Audio ile üretilir)
type Sound = 'join' | 'leave' | 'mute' | 'unmute' | 'message'

let ctx: AudioContext | null = null

const notes: Record<Sound, [number, number][]> = {
  join: [[523, 0], [784, 0.09]],
  leave: [[784, 0], [523, 0.09]],
  mute: [[440, 0]],
  unmute: [[660, 0]],
  message: [[880, 0], [1175, 0.06]],
}

export function playSound(s: Sound, volume = 0.08) {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    for (const [freq, at] of notes[s]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + at)
      gain.gain.linearRampToValueAtTime(volume, now + at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.14)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.15)
    }
  } catch {
    // ses çalınamadı, önemli değil
  }
}
