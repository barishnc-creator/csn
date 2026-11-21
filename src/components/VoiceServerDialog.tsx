import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'

type Mode = 'auto' | 'cloud' | 'self' | 'cf'

const options: { id: Mode; title: string; text: string }[] = [
  { id: 'auto', title: 'Otomatik (önerilen)', text: 'LiveKit Cloud kullanılır. Kota biterse ya da Cloud\'a bağlanılamazsa herkes birlikte yedek sunucuya geçer; 3 saatte bir Cloud yeniden denenir.' },
  { id: 'cloud', title: 'Hep LiveKit Cloud', text: 'Yedek sunucu hiç kullanılmaz.' },
  { id: 'cf', title: 'Cloudflare (deneme)', text: 'Cloudflare Realtime: ayda 1.000 GB ücretsiz, dakika sınırı yok. Şimdilik yalnız mikrofon sesi; kamera ve ekran paylaşımı yakında. Seçmeden önce herkes sayfayı yenilemiş olmalı.' },
  { id: 'self', title: 'Hep yedek sunucu', text: 'Oracle\'daki kendi sunucumuz. Ayakta değilse Cloud\'a dönülür.' },
]

/** Sahibe özel: ses sunucusu seçimi (0022) */
export default function VoiceServerDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [until, setUntil] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('server_state')
      .select('voice_mode, voice_fallback_until')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setMode((data?.voice_mode as Mode) ?? 'auto')
        setUntil(data?.voice_fallback_until ?? null)
      })
  }, [])

  async function choose(m: Mode) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('set_voice_mode', { mode: m })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setMode(m)
      setUntil(null)
    }
  }

  const onFallback = mode === 'auto' && until && Date.parse(until) > Date.now()

  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-head">
          <h3>Ses sunucusu</h3>
          <button className="icon-btn" onClick={onClose} title="Kapat"><Icon name="x" /></button>
        </div>
        {onFallback && (
          <p className="muted">
            Şu an <strong>yedek sunucudasınız</strong> (Cloud'a bağlanılamadı). {new Date(until!).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} sonrası Cloud yeniden denenir.
          </p>
        )}
        <div className="voice-server-options">
          {options.map((o) => (
            <button
              key={o.id}
              className={`voice-server-option${mode === o.id ? ' active' : ''}`}
              onClick={() => choose(o.id)}
              disabled={busy || mode === null}
            >
              <span className="vs-radio" aria-hidden="true">{mode === o.id && <Icon name="check" size={12} />}</span>
              <span>
                <strong>{o.title}</strong>
                <small>{o.text}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="muted small-note">Değişiklik yeni bağlananlar için geçerlidir; sesli sohbette olanlar odaya yeniden girince geçer.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  )
}
