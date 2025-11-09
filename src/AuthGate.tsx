import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import App from './App' // your existing inventory app

type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => { sub.subscription.unsubscribe() }
  }, [])

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  if (!session) {
    return (
      <div style={{maxWidth: 420, margin: '14vh auto', padding: 16, fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Arial'}}>
        <h2 style={{marginBottom: 6}}>Inventory — Sign in</h2>
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            style={{padding:'10px 14px', borderRadius:8, border:'1px solid #cbd5e1', background:'#f8fafc', cursor:'pointer'}}
          >
            Sign in
          </button>
        ) : (
          <form onSubmit={signIn} style={{display:'grid', gap:10}}>
            <input
              type="email" placeholder="Email"
              value={email} onChange={e=>setEmail(e.target.value)}
              style={{padding:'10px', border:'1px solid #cbd5e1', borderRadius:8}}
              required
            />
            <input
              type="password" placeholder="Password"
              value={password} onChange={e=>setPassword(e.target.value)}
              style={{padding:'10px', border:'1px solid #cbd5e1', borderRadius:8}}
              required
            />
            {error && <div style={{color:'#b91c1c', fontSize:13}}>{error}</div>}
            <button type="submit"
              style={{padding:'10px 14px', borderRadius:8, border:'1px solid #2563eb', background:'#2563eb', color:'#fff', cursor:'pointer'}}
            >
              Continue
            </button>
            <div style={{color:'#64748b', fontSize:12}}>
              Use the email/password you created in Supabase (Auth → Users).
            </div>
          </form>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{display:'flex', justifyContent:'flex-end', padding:8}}>
        <button onClick={signOut}
          style={{padding:'6px 10px', borderRadius:8, border:'1px solid #cbd5e1', background:'#f8fafc', cursor:'pointer'}}
        >
          Sign out
        </button>
      </div>
      <App />
    </div>
  )
}
