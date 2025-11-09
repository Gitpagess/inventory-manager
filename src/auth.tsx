import React, { useEffect, useState } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = "https://bkhkgxgmlhvjidoximyx.supabase.co";
const supabaseAnon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraGtneGdtbGh2amlkb3hpbXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1ODU2NjYsImV4cCI6MjA3ODE2MTY2Nn0.56GAQbU5vFYtBZwz8vFYTj8tttzEdKcwvQRjd8yz8WI";
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnon)

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn = async () => {
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>

  if (!session) {
    return (
      <div style={{ maxWidth: 420, margin: '8vh auto', padding: 16, border: '1px solid #e5e7eb', borderRadius: 12, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
        <h2 style={{ marginTop: 0 }}>Sign in to Inventory</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <label>Email
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8 }}/>
          </label>
          <label>Password
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8 }}/>
          </label>
          {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
          <button onClick={signIn} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
            Sign In
          </button>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Don’t have an account? In Supabase → Auth → Users, invite/create a user.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, borderBottom: '1px solid #e5e7eb', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
        <div style={{ fontWeight: 600 }}>Inventory (signed in as {session.user.email})</div>
        <div style={{ flex: 1 }} />
        <button onClick={signOut} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
      {children}
    </div>
  )
}
