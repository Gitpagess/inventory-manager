import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

type Item = {
  id: string
  model: string
  serial: string
  status: 'Stock' | 'Display' | 'Open Box' | 'Ordered' | 'Reserved' | 'Installed/Sold' | 'Returned'
  location?: string | null
  notes?: string | null
  cost?: number | null
  received_at?: string | null // ISO date
  updated_at?: string | null
  // Row Level Security note: anon key must be allowed per policy
}

const STATUSES: Item['status'][] = [
  'Stock','Display','Open Box','Ordered','Reserved','Installed/Sold','Returned'
]

// ---- UI helpers
const S = {
  page: { maxWidth: 960, margin: '24px auto', padding: '0 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 },
  h1: { fontSize: 22, margin: '0 0 8px' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  input: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8 },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8 },
  btn: { padding: '8px 12px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8, cursor: 'pointer' },
  btnPri: { padding: '8px 12px', border: '1px solid #2563eb', background: '#2563eb', color: '#fff', borderRadius: 8, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto' as const, borderRadius: 12 },
  th: { textAlign: 'left' as const, padding: 10, background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e5e7eb' },
  td: { padding: 10, borderBottom: '1px solid #f1f5f9' }
}

// ---- Auth UI
function AuthBox({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>('')

  const signIn = async () => {
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); return }
    onSignedIn()
  }

  const signUp = async () => {
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); return }
    // After sign-up, user may need to verify email depending on your Supabase settings
    alert('Check your email to verify (if required), then sign in.')
  }

  return (
    <div style={S.card as any}>
      <div style={S.h1 as any}>Sign in to Inventory</div>
      <div style={S.row as any}>
        <input style={S.input as any} value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" />
        <input type="password" style={S.input as any} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" />
        <button style={S.btnPri as any} onClick={signIn}>Sign In</button>
        <button style={S.btn as any} onClick={signUp}>Sign Up</button>
      </div>
      {error && <div style={{ color: '#b91c1c', marginTop: 8 }}>{error}</div>}
    </div>
  )
}

// ---- Inventory App
export default function App() {
  const [sessionChecked, setSessionChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)

  const [model, setModel] = useState('')
  const [serial, setSerial] = useState('')
  const [status, setStatus] = useState<Item['status']>('Stock')

  // session check
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setSessionChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setAuthed(!!sess)
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  // load items + realtime
  useEffect(() => {
    if (!authed) return

    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('updated_at', { ascending: false })
      if (!error && data) setItems(data as Item[])
      setLoading(false)
    }
    load()

    // realtime channel
    const channel = supabase
      .channel('inv-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items' },
        (payload: any) => {
          setItems(curr => {
            const row = payload.new ?? payload.old
            if (payload.eventType === 'DELETE') {
              return curr.filter(x => x.id !== row.id)
            }
            // upsert
            const idx = curr.findIndex(x => x.id === row.id)
            if (idx >= 0) {
              const copy = curr.slice()
              copy[idx] = row
              return copy
            }
            return [row, ...curr]
          })
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [authed])

  const addItem = async () => {
    if (!model.trim() || !serial.trim()) return alert('Model and Serial required')
    const { error } = await supabase.from('inventory_items').insert({
      model: model.trim(),
      serial: serial.trim(),
      status,
      updated_at: new Date().toISOString()
    })
    if (error) alert(error.message)
    setModel(''); setSerial('')
  }

  const updateItem = async (id: string, patch: Partial<Item>) => {
    const { error } = await supabase.from('inventory_items').update({
      ...patch, updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) alert(error.message)
  }

  const removeItem = async (id: string) => {
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) alert(error.message)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setAuthed(false)
  }

  if (!sessionChecked) {
    return <div style={S.page as any}>Loading…</div>
  }

  if (!authed) {
    return <div style={S.page as any}><AuthBox onSignedIn={() => setAuthed(true)} /></div>
  }

  return (
    <div style={S.page as any}>
      <div style={{ ...S.row as any, justifyContent: 'space-between' }}>
        <h1 style={S.h1 as any}>Inventory Manager</h1>
        <button style={S.btn as any} onClick={signOut}>Sign Out</button>
      </div>

      <div style={S.card as any}>
        <div style={S.row as any}>
          <input style={S.input as any} placeholder="Model" value={model} onChange={e=>setModel(e.target.value)} />
          <input style={S.input as any} placeholder="Serial" value={serial} onChange={e=>setSerial(e.target.value)} />
          <select style={S.select as any} value={status} onChange={e=>setStatus(e.target.value as Item['status'])}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button style={S.btnPri as any} onClick={addItem}>Add</button>
        </div>
      </div>

      <div style={S.card as any}>
        {loading ? 'Loading…' : (
          <div style={S.tableWrap as any}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th as any}>Model</th>
                  <th style={S.th as any}>Serial</th>
                  <th style={S.th as any}>Status</th>
                  <th style={S.th as any}>Updated</th>
                  <th style={S.th as any}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id}>
                    <td style={S.td as any}><b>{it.model}</b></td>
                    <td style={S.td as any}>{it.serial}</td>
                    <td style={S.td as any}>
                      <select
                        style={S.select as any}
                        value={it.status}
                        onChange={e=>updateItem(it.id, { status: e.target.value as Item['status'] })}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={S.td as any}>{it.updated_at ? new Date(it.updated_at).toLocaleString() : '—'}</td>
                    <td style={S.td as any}>
                      <button style={S.btn as any} onClick={()=>removeItem(it.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td style={S.td as any} colSpan={5}>No items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
