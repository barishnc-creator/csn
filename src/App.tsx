import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './lib/supabase'
import { AppProvider } from './lib/store'
import { VoiceProvider } from './voice/VoiceContext'
import AuthScreen from './auth/AuthScreen'
import JoinScreen from './auth/JoinScreen'
import Layout from './components/Layout'
import { DialogHost } from './lib/dialog'

type Gate = 'loading' | 'member' | 'not-member'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [gate, setGate] = useState<Gate>('loading')

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    setGate('loading')
    supabase
      .from('members')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setGate(data ? 'member' : 'not-member'))
  }, [userId])

  if (!configured) {
    return (
      <div className="center-screen">
        <div className="card">
          <h1>CSN</h1>
          <p>Uygulama henüz bir sunucuya bağlanmadı. <code>VITE_SUPABASE_URL</code> ve <code>VITE_SUPABASE_KEY</code> ayarlanmalı.</p>
        </div>
      </div>
    )
  }
  if (session === undefined || (session && gate === 'loading')) {
    return <div className="center-screen"><div className="spinner" /></div>
  }
  if (!session) return <AuthScreen />
  if (gate === 'not-member') return <JoinScreen session={session} onJoined={() => setGate('member')} />

  return (
    <AppProvider userId={session.user.id}>
      <VoiceProvider>
        <Layout />
        <DialogHost />
      </VoiceProvider>
    </AppProvider>
  )
}
