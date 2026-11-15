import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/** Bir düğmenin üstünde açılan, ekran dışına taşmayan küçük panel (dışarı tıklayınca / Esc ile kapanır) */
export default function AnchoredPopover({
  anchor,
  onClose,
  className,
  width = 300,
  children,
}: {
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
  className?: string
  width?: number
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const w = Math.min(width, window.innerWidth - 16)
      const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))
      setPos({ left, bottom: Math.max(8, window.innerHeight - r.top + 8) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, width])

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [anchor, onClose])

  return (
    <div
      ref={box}
      className={`popover anchored-pop${className ? ` ${className}` : ''}`}
      style={{ width: Math.min(width, window.innerWidth - 16), left: pos?.left ?? -9999, bottom: pos?.bottom ?? 0 }}
    >
      {children}
    </div>
  )
}
