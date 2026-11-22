import Logo from '../components/Logo'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearPendingInvite, pendingInvite } from '../lib/invite'

export default function JoinScreen({ session, onJoined }: { session: Session; onJoined: () => void }) {
  const metaCode = (session.user.user_metadata?.invite_code as string | undefined) || pendingInvite()
  const [code, setCode] = useState(metaCode)
  const [initialized, setInitialized] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tried = useRef(false)

  async function redeem(c: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('redeem_invite', { invite_code: c })
    setBusy(false)
    if (error) setError(error.message)
    else {
      clearPendingInvite()
      onJoined()
    }
  }

  useEffect(() => {
    supabase.rpc('server_initialized').then(({ data }) => setInitialized(Boolean(data)))
  }, [])

  // Kayıtta girilen kodu otomatik dene
  useEffect(() => {
    if (initialized && metaCode && !tried.current) {
      tried.current = true
      redeem(metaCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, metaCode])

  async function claim() {
    setBusy(true)
    const { data, error } = await supabase.rpc('claim_first_admin')
    setBusy(false)
    if (error) setError(error.message)
    else if (data) onJoined()
    else {
      setInitialized(true)
      setError('Sunucu az önce başka biri tarafından kuruldu. Davet kodu gerekiyor.')
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (code.trim()) redeem(code)
  }

  return (
    <div className="center-screen auth-bg">
      <div className="card auth-card">
        <div className="auth-logo"><Logo size={36} /></div>
        {initialized === false ? (
          <>
            <h1>Sunucuyu kur</h1>
            <p className="muted">Cousy'de henüz kimse yok. Kurarsan sunucunun yöneticisi sen olursun ve arkadaşlarına davet kodu verebilirsin.</p>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary block" onClick={claim} disabled={busy}>Sunucuyu kur ve yönetici ol</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1>Davet kodu</h1>
            <p className="muted">Cousy kapalı bir sunucu. Katılmak için bir yöneticiden davet kodu iste.</p>
            <label>
              Davet kodu
              <input value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary block" disabled={busy || initialized === null}>Katıl</button>
          </form>
        )}
        <p className="muted small">
          {session.user.email} ·{' '}
          <button className="link" onClick={() => supabase.auth.signOut()}>Çıkış yap</button>
        </p>
      </div>
    </div>
  )
}
