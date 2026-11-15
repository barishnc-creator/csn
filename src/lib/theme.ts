// Sunucu temaları (renk paletleri midnight-discord ve flavor'larından esinlenildi)
export type ThemeId = 'midnight' | 'tokyo' | 'catppuccin' | 'nord' | 'rosepine'

export interface ThemeMeta {
  id: ThemeId
  name: string
  desc: string
  /** Önizleme kartı: zemin, panel, vurgu, yazı */
  swatch: [string, string, string, string]
  accent: string
}

export const THEMES: ThemeMeta[] = [
  { id: 'midnight', name: 'Midnight', desc: 'Koyu, yuvarlak, yüzen paneller; mor vurgu', swatch: ['#09090d', '#14141b', '#8b5cff', '#ececf1'], accent: '#8b5cff' },
  { id: 'tokyo', name: 'Tokyo Night', desc: 'Gece mavisi, neon mavi-mor; oyuncu havası', swatch: ['#13141c', '#1a1b26', '#7aa2f7', '#c0caf5'], accent: '#7aa2f7' },
  { id: 'catppuccin', name: 'Catppuccin Mocha', desc: 'Yumuşak pastel, göz yormayan sıcak tonlar', swatch: ['#11111b', '#1e1e2e', '#cba6f7', '#cdd6f4'], accent: '#cba6f7' },
  { id: 'nord', name: 'Nord', desc: 'Buzul mavisi, sakin ve dengeli', swatch: ['#242933', '#2e3440', '#88c0d0', '#eceff4'], accent: '#88c0d0' },
  { id: 'rosepine', name: 'Rosé Pine', desc: 'Gül kurusu ve çam; zarif ve sıcak', swatch: ['#13111c', '#191724', '#ebbcba', '#e0def4'], accent: '#ebbcba' },
]

export const ACCENTS = ['#8b5cff', '#5b8cff', '#7aa2f7', '#23c47e', '#f5a524', '#f0475a', '#ec4899', '#22d3ee']

/** Temayı <html data-theme> ve isteğe bağlı vurgu rengiyle uygula */
export function applyTheme(theme: ThemeId, accent: string | null) {
  const root = document.documentElement
  root.dataset.theme = theme
  if (accent) {
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-2', accent)
    root.style.setProperty('--accent-soft', hexToRgba(accent, 0.18))
    root.style.setProperty('--active', hexToRgba(accent, 0.16))
    root.style.setProperty('--grad', `linear-gradient(135deg, ${accent}, ${shade(accent, -18)})`)
  } else {
    for (const v of ['--accent', '--accent-2', '--accent-soft', '--active', '--grad']) root.style.removeProperty(v)
  }
}

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
function shade(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)))
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}
