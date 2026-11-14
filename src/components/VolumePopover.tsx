import { useEffect, useRef } from 'react'
import { useApp } from '../lib/store'
import { useVoice } from '../voice/VoiceContext'

export default function VolumePopover({ userId, x, y, onClose }: { userId: string; x: number; y: number; onClose: () => void }) {
  const { profiles } = useApp()
  const voice = useVoice()
  const ref = useRef<HTMLDivElement>(null)
  const value = voice.settings.volumes[userId] ?? 1

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div ref={ref} className="popover" style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 110) }}>
      <div className="popover-title">{profiles[userId]?.display_name ?? 'Üye'}</div>
      <label className="small muted">Kullanıcı ses seviyesi: %{Math.round(value * 100)}</label>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        onChange={(e) => voice.setVolume(userId, Number(e.target.value))}
      />
    </div>
  )
}
