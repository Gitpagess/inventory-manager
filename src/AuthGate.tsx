import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

type Props = { children: React.ReactNode }

export default function AuthGate({ children }: Props) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<null | { user: any }>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session as any)
      setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s as any)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn() {
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
  }

  async function signUp() {
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7fafc' }}>
        <div style={{ width: 360, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Inventory Login</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Use your email & password.</div>

          <div style={{ display: 'grid', gap: 8 }}>
            <input
              style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8 }}
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <input
              type="password"
              style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8 }}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {error && <div style={{ color: '#b91c1c', fontSize: 12 }}>{error}</div>}

            <button
              style={{ padding: '10px 12px', background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer' }}
              onClick={signIn}
            >
              Sign In
            </button>
            <button
              style={{ padding: '10px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer' }}
              onClick={signUp}
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontWeight: 600, flex: 1 }}>4Seasons / Gaslight — Inventory</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{session.user?.email}</div>
        <button
          onClick={signOut}
          style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
      {children}
    </div>
  )
}
