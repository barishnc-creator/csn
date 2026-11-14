import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { getDesktop, type DesktopSource } from '../lib/desktop'

export type ShareSurface = 'monitor' | 'window' | 'browser'
export type ShareQuality = 'smooth' | 'clear' | 'game'

export interface ShareChoice {
  surface: ShareSurface
  quality: ShareQuality
  audio: boolean
  /** Yalnız masaüstü uygulamasında: seçilen ekran/pencere kaynağı */
  sourceId?: string
}

const QUALITIES: { id: ShareQuality; label: string; desc: string }[] = [
  { id: 'smooth', label: 'Akıcı', desc: '720p · 30 FPS' },
  { id: 'clear', label: 'Net', desc: '1080p · 30 FPS' },
  { id: 'game', label: 'Oyun', desc: '1080p · 60 FPS' },
]

const SURFACES: { id: ShareSurface; label: string; desc: string }[] = [
  { id: 'monitor', label: 'Tüm ekran', desc: 'Bütün ekranın görünür' },
  { id: 'window', label: 'Uygulama penceresi', desc: 'Yalnız seçtiğin pencere' },
  { id: 'browser', label: 'Chrome sekmesi', desc: 'Tek bir tarayıcı sekmesi' },
]

const PREFS_KEY = 'csn.screenshare'

function loadPrefs(): { surface: ShareSurface; quality: ShareQuality; audio: boolean } {
  const d = { surface: 'monitor' as ShareSurface, quality: 'clear' as ShareQuality, audio: true }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...d, ...JSON.parse(raw) } : d
  } catch {
    return d
  }
}

function savePrefs(p: { surface: ShareSurface; quality: ShareQuality; audio: boolean }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // yoksay
  }
}

const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

export default function ScreenSharePicker({
  open,
  onClose,
  onShare,
}: {
  open: boolean
  onClose: () => void
  onShare: (choice: ShareChoice) => void
}) {
  const desktop = getDesktop()
  const [prefs] = useState(loadPrefs)
  const [surface, setSurface] = useState<ShareSurface>(prefs.surface)
  const [quality, setQuality] = useState<ShareQuality>(prefs.quality)
  const [audio, setAudio] = useState(prefs.audio)

  // Masaüstü: gerçek kaynak listesi
  const [tab, setTab] = useState<'screen' | 'window'>('screen')
  const [sources, setSources] = useState<DesktopSource[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const d = getDesktop()
    if (!d) return
    setLoading(true)
    setLoadError(null)
    try {
      const list = await d.getSources()
      setSources(list)
      setSelected((cur) => (cur && list.some((s) => s.id === cur) ? cur : null))
    } catch (e) {
      setLoadError(`Ekranlar alınamadı: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (desktop) {
      setSelected(null)
      setTab('screen')
      refresh()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Masaüstünde ilk açılışta ilk ekranı seçili getir
  useEffect(() => {
    if (!desktop || selected || tab !== 'screen') return
    const first = sources.find((s) => s.kind === 'screen')
    if (first) setSelected(first.id)
  }, [desktop, sources, selected, tab])

  if (!open) return null

  const confirm = () => {
    if (desktop) {
      const src = sources.find((s) => s.id === selected)
      if (!src) return
      savePrefs({ surface, quality, audio })
      onShare({ surface: src.kind === 'screen' ? 'monitor' : 'window', quality, audio, sourceId: src.id })
      return
    }
    savePrefs({ surface, quality, audio })
    onShare({ surface, quality, audio })
  }

  const qualityPicker = (
    <div className="ssp-section">
      <div className="ssp-label">Yayın kalitesi</div>
      <div className="segmented ssp-quality">
        {QUALITIES.map((q) => (
          <button key={q.id} type="button" className={quality === q.id ? 'active' : ''} onClick={() => setQuality(q.id)}>
            <span className="ssp-q-name">{q.label}</span>
            <span className="ssp-q-desc">{q.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const audioRow = (hint: string) => (
    <label className="switch-row">
      <span>
        <strong>Sesi de paylaş</strong>
        <span className="muted small">{hint}</span>
      </span>
      <input type="checkbox" className="switch" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
    </label>
  )

  const shown = sources.filter((s) => s.kind === tab)

  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog screen-picker${desktop ? ' desktop' : ''}`} role="dialog" aria-label="Ekranını paylaş">
        <div className="dialog-head">
          <h3>
            <Icon name="screen" size={18} /> Ekranını paylaş
          </h3>
          <button className="icon-btn" onClick={onClose} title="Kapat (Esc)">
            <Icon name="x" />
          </button>
        </div>

        {desktop ? (
          <>
            <div className="ssp-tabs">
              <div className="segmented">
                <button type="button" className={tab === 'screen' ? 'active' : ''} onClick={() => setTab('screen')}>
                  Ekranlar
                </button>
                <button type="button" className={tab === 'window' ? 'active' : ''} onClick={() => setTab('window')}>
                  Uygulamalar
                </button>
              </div>
              <button className="btn ghost small" type="button" onClick={refresh} disabled={loading}>
                {loading ? 'Yükleniyor…' : 'Yenile'}
              </button>
            </div>
            {loadError && <div className="form-error">{loadError}</div>}
            <div className="ssp-grid">
              {shown.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`ssp-card${selected === s.id ? ' selected' : ''}`}
                  onClick={() => setSelected(s.id)}
                  onDoubleClick={() => {
                    setSelected(s.id)
                    savePrefs({ surface, quality, audio })
                    onShare({ surface: s.kind === 'screen' ? 'monitor' : 'window', quality, audio, sourceId: s.id })
                  }}
                  title={s.name}
                >
                  <span className="ssp-thumb">
                    {s.thumbnail ? <img src={s.thumbnail} alt="" draggable={false} /> : <Icon name="screen" size={28} />}
                    {selected === s.id && (
                      <span className="ssp-check">
                        <Icon name="check" size={14} />
                      </span>
                    )}
                  </span>
                  <span className="ssp-name">
                    {s.appIcon && <img src={s.appIcon} alt="" className="ssp-appicon" />}
                    <span>{s.name}</span>
                  </span>
                </button>
              ))}
              {!loading && shown.length === 0 && (
                <div className="ssp-empty muted">
                  {tab === 'screen' ? 'Ekran bulunamadı.' : 'Paylaşılabilecek açık pencere yok.'}
                </div>
              )}
            </div>
            {qualityPicker}
            {audioRow(
              isWindows
                ? 'Bilgisayarının sesi de yayına eklenir (oyun, video, müzik).'
                : 'Sistem sesi şu an yalnız Windows sürümünde paylaşılabiliyor.',
            )}
          </>
        ) : (
          <>
            <div className="ssp-section">
              <div className="ssp-label">Ne paylaşılsın?</div>
              <div className="ssp-surfaces">
                {SURFACES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`ssp-surface${surface === s.id ? ' selected' : ''}`}
                    onClick={() => setSurface(s.id)}
                  >
                    <strong>{s.label}</strong>
                    <span className="muted small">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            {qualityPicker}
            {audioRow(
              surface === 'browser'
                ? 'Açılacak tarayıcı penceresinde "Sekme sesini de paylaş" seçeneğini de işaretle.'
                : 'Açılacak tarayıcı penceresinde "Sistem sesiyle paylaş" seçeneğini de aç.',
            )}
            <p className="muted small ssp-note">
              <Icon name="sparkles" size={14} /> Devam edince tarayıcı son bir onay penceresi açar; güvenlik gereği bu
              adım atlanamaz. Masaüstü uygulamasında bu pencere çıkmaz.
            </p>
          </>
        )}

        <div className="dialog-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" type="button" onClick={confirm} disabled={!!desktop && !selected} autoFocus>
            <Icon name="screen" size={16} /> Yayına başla
          </button>
        </div>
      </div>
    </div>
  )
}
