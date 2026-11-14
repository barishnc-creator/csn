import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı' : error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name.trim(), invite_code: invite.trim().toLowerCase() },
          emailRedirectTo: window.location.href,
        },
      })
      if (error) setError(error.message)
      else if (!data.session) setInfo('Kayıt alındı. E-postana gelen bağlantıyla hesabını doğrula, sonra giriş yap.')
    }
    setBusy(false)
  }

  return (
    <div className="center-screen auth-bg">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo">CSN</div>
        <h1>{mode === 'login' ? 'Tekrar hoş geldin!' : 'Hesap oluştur'}</h1>
        <p className="muted">{mode === 'login' ? 'Ekibin seni bekliyor.' : 'Davet kodunla CSN\'ye katıl.'}</p>

        {mode === 'register' && (
          <label>
            Görünen ad
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required autoFocus />
          </label>
        )}
        <label>
          E-posta
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'login'} />
        </label>
        <label>
          Şifre
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </label>
        {mode === 'register' && (
          <label>
            Davet kodu
            <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="ilk kurulumda boş bırak" />
          </label>
        )}

        {error && <div className="form-error">{error}</div>}
        {info && <div className="form-info">{info}</div>}

        <button className="btn primary block" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}
        </button>
        <p className="muted small">
          {mode === 'login' ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setInfo(null) }}>
            {mode === 'login' ? 'Kayıt ol' : 'Giriş yap'}
          </button>
        </p>
      </form>
    </div>
  )
}
