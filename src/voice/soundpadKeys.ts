// Soundpad tuş atamaları: her ses için kişiye özel kısayol (en az iki tuş: değiştirici + tuş).
// Bu cihazda saklanır (localStorage); başkalarını etkilemez.
import { useSyncExternalStore } from 'react'

const KEY = 'csn.soundpad.keys'
const MODS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const

type Binds = Record<string, string> // ses id → kombinasyon ("Ctrl+Shift+Digit1")

function load(): Binds {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as Binds) : {}
  } catch {
    return {}
  }
}

let binds: Binds = load()
const listeners = new Set<() => void>()
function save(next: Binds) {
  binds = next
  try {
    localStorage.setItem(KEY, JSON.stringify(binds))
  } catch {
    // yoksay
  }
  listeners.forEach((l) => l())
}

export const soundpadKeys = {
  get: () => binds,
  /** Aynı kombinasyon başka seste varsa oradan kaldırılır */
  set(soundId: string, combo: string) {
    const next: Binds = {}
    for (const [id, c] of Object.entries(binds)) if (c !== combo && id !== soundId) next[id] = c
    next[soundId] = combo
    save(next)
  },
  clear(soundId: string) {
    const next = { ...binds }
    delete next[soundId]
    save(next)
  },
  /** Kombinasyona bağlı ses */
  find(combo: string) {
    return Object.entries(binds).find(([, c]) => c === combo)?.[0]
  },
}

export function useSoundpadKeys(): Binds {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => binds,
    () => binds,
  )
}

const isModifierCode = (code: string) => /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(code)

/** Basılan tuşlardan kombinasyon; yalnız değiştirici basılıysa ya da hiç değiştirici yoksa null */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (!e.code || isModifierCode(e.code)) return null
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean) as string[]
  if (mods.length === 0) return null // en az iki tuş
  return [...mods, e.code].join('+')
}

/** Ekranda gösterilecek ad: "Ctrl + 1" */
export function comboLabel(combo: string) {
  return combo
    .split('+')
    .map((p) =>
      (MODS as readonly string[]).includes(p)
        ? p === 'Meta' ? 'Win' : p
        : p
            .replace(/^Key/, '')
            .replace(/^Digit/, '')
            .replace(/^Numpad/, 'Num ')
            .replace(/^Arrow/, '')
            .replace('Backquote', '`')
            .replace('Minus', '-')
            .replace('Equal', '=')
            .replace('BracketLeft', '[')
            .replace('BracketRight', ']')
            .replace('Semicolon', ';')
            .replace('Quote', "'")
            .replace('Comma', ',')
            .replace('Period', '.')
            .replace('Slash', '/')
            .replace('Backslash', '\\'),
    )
    .join(' + ')
}
