import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------- Types ----------
const STATUSES = [
  'Stock','Display','Open Box','Ordered','Reserved','Installed/Sold','Returned'
] as const
type Status = typeof STATUSES[number]
type Item = {
  id: string
  model: string
  serial?: string
  status: Status
  location?: string
  notes?: string
  cost?: number
  receivedAt?: string
  updatedAt: string
}

// ---------- ENV & Supabase ----------
const SUPABASE_URL = "https://bkhkgxgmlhvjidoximyx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraGtneGdtbGh2amlkb3hpbXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1ODU2NjYsImV4cCI6MjA3ODE2MTY2Nn0.56GAQbU5vFYtBZwz8vFYTj8tttzEdKcwvQRjd8yz8WI";

let supabase: SupabaseClient | null = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
} else {
  console.warn('Supabase env missing. Running in local-only mode.')
}

// ---------- Local storage ----------
const STORAGE_KEY = 'inventory-manager-v1'
const loadLocal = (): Item[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
const saveLocal = (items: Item[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
const uuid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now()

// ---------- CSV helpers ----------
function csvEscape(v: string | number | undefined) {
  if (v === undefined || v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s
}
function downloadCSV(filename: string, rows: Item[]) {
  const header = ["Model","Serial","Status","Location","Notes","Cost","ReceivedAt","UpdatedAt"]
  const lines = [header.join(",")].concat(
    rows.map(r => [r.model,r.serial,r.status,r.location,r.notes,r.cost??"",r.receivedAt??"",r.updatedAt].map(csvEscape).join(","))
  )
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}
function parseCSV(text: string): Item[] {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
  const header = lines[0].split(",").map(s=>s.trim().toLowerCase())
  const idx = (name:string)=> header.indexOf(name.toLowerCase())
  const items: Item[] = []
  for (let i=1;i<lines.length;i++) {
    const row = lines[i]
    const cols = row.match(/([^",]+|"(?:[^"]|"")*")+/g) || []
    const get = (n:string)=> {
      const j = idx(n); if (j<0) return ""
      const raw = cols[j] || ""
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1,-1).replaceAll('""','"') : raw
    }
    const now = new Date().toISOString()
    items.push({
      id: uuid(),
      model: get("model") || "UNKNOWN",
      serial: get("serial") || undefined,
      status: (get("status") as Status) || "Stock",
      location: get("location") || undefined,
      notes: get("notes") || undefined,
      cost: get("cost") ? Number(get("cost")) : undefined,
      receivedAt: get("receivedat") || undefined,
      updatedAt: get("updatedat") || now,
    })
  }
  return items
}

// ---------- Auth UI ----------
function AuthBar({ authed, email, onSignIn, onSignOut }: {
  authed: boolean, email?: string,
  onSignIn: (email: string)=>void, onSignOut: ()=>void
}) {
  const [v, setV] = useState('')
  if (authed) {
    return (
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <span style={{fontSize:12,color:'#555'}}>Signed in as {email || 'user'}</span>
        <button onClick={onSignOut} style={btn}>Sign out</button>
      </div>
    )
  }
  return (
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      <input value={v} onChange={e=>setV(e.target.value)} placeholder="name@company.com" style={input} />
      <button onClick={()=> v && onSignIn(v)} style={btnPrimary}>Send sign-in link</button>
    </div>
  )
}

// ---------- Styles ----------
const container: React.CSSProperties = { maxWidth:1100, margin:'0 auto', padding:16, fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, Arial' }
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:12, marginBottom:12 }
const input: React.CSSProperties = { padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:8 }
const select: React.CSSProperties = { padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:8 }
const btn: React.CSSProperties = { padding:'8px 12px', border:'1px solid #cbd5e1', background:'#f8fafc', borderRadius:8, cursor:'pointer' }
const btnPrimary: React.CSSProperties = { padding:'8px 12px', border:'1px solid #2563eb', background:'#2563eb', color:'#fff', borderRadius:8, cursor:'pointer' }

// ---------- App ----------
export default function App() {
  const [items, setItems] = useState<Item[]>(loadLocal())
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [authed, setAuthed] = useState(false)
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  // Persist locally always (works even if Supabase missing)
  useEffect(()=>{ saveLocal(items) }, [items])

  // Supabase auth state
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setAuthed(true)
        setUserEmail(data.user.email || undefined)
        pullFromSupabase()
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session)=>{
      setAuthed(!!session)
      setUserEmail(session?.user?.email || undefined)
      if (session) pullFromSupabase()
    })
    return () => { sub?.subscription?.unsubscribe() }
  }, [])

  // Pull all items from Supabase into app state
  async function pullFromSupabase() {
    if (!supabase) return
    const { data, error } = await supabase.from('inventory_items')
      .select('*').order('updated_at', { ascending:false })
    if (error) { console.error('pull error', error); return }
    if (!data) return
    const mapped: Item[] = data.map((r:any)=>({
      id: r.id,
      model: r.model,
      serial: r.serial || undefined,
      status: r.status,
      location: r.location || undefined,
      notes: r.notes || undefined,
      cost: r.cost ? Number(r.cost) : undefined,
      receivedAt: r.received_at || undefined,
      updatedAt: r.updated_at,
    }))
    setItems(mapped)
  }

  // Push a single item (insert or update)
  async function pushItem(it: Item) {
    if (!supabase || !authed) return
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return
    const payload = {
      id: it.id,
      user_id: uid,
      model: it.model,
      serial: it.serial ?? null,
      status: it.status,
      location: it.location ?? null,
      notes: it.notes ?? null,
      cost: it.cost ?? null,
      received_at: it.receivedAt ?? null,
      updated_at: it.updatedAt,
    }
    // upsert
    const { error } = await supabase.from('inventory_items').upsert(payload, { onConflict: 'id' })
    if (error) console.error('push error', error)
  }

  function upsertLocal(it: Item) {
    setItems(prev => {
      const idx = prev.findIndex(p=>p.id===it.id)
      const next = idx>=0 ? [...prev.slice(0,idx), it, ...prev.slice(idx+1)] : [it, ...prev]
      return next
    })
    pushItem(it) // if authed, sync
  }

  function addBlank() {
    const now = new Date().toISOString()
    upsertLocal({ id: uuid(), model:'UNKNOWN', status:'Stock', updatedAt: now })
  }

  function doExport() {
    downloadCSV(`inventory-${new Date().toISOString().slice(0,10)}.csv`, filtered)
  }

  async function doImport(file: File) {
    const text = await file.text()
    const toAdd = parseCSV(text)
    toAdd.forEach(upsertLocal)
  }

  async function signIn(email: string) {
    if (!supabase) { alert('Supabase is not configured.'); return }
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) { alert(error.message); return }
    alert('Check your email for a magic link to sign in.')
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  // filters
  const filtered = useMemo(()=>{
    const t = q.trim().toLowerCase()
    return items.filter(it=>{
      const hay = [it.model,it.serial,it.status,it.location,it.notes].filter(Boolean).join(' ').toLowerCase()
      const okQ = !t || hay.includes(t)
      const okS = statusFilter==='all' || it.status===statusFilter
      return okQ && okS
    })
  }, [items,q,statusFilter])

  return (
    <div style={container}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:18,fontWeight:700}}>Inventory Manager</div>
        <div style={{display:'flex',gap:12,alignItems:'center'}}>
          {!SUPABASE_URL && <span style={{fontSize:12,color:'#b45309'}}>Local-only (no sync): set VITE_SUPABASE_URL/KEY at build.</span>}
          <AuthBar authed={authed} email={userEmail} onSignIn={signIn} onSignOut={signOut} />
        </div>
      </div>

      <div style={card}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <input placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)} style={{...input,flex:1,minWidth:240}} />
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={select}>
            <option value="all">All</option>
            {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <button style={btnPrimary} onClick={addBlank}>+ Add</button>
          <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={(e)=>{ const f=e.target.files?.[0]; if(f) doImport(f); (e.currentTarget as any).value=''; }} />
          <button style={btn} onClick={()=>fileRef.current?.click()}>Import CSV</button>
          <button style={btn} onClick={doExport}>Export CSV</button>
        </div>
      </div>

      <div style={{border:'1px solid #e5e7eb',borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
          <thead style={{background:'#f8fafc',color:'#475569'}}>
            <tr>
              <th style={th}>Model</th>
              <th style={th}>Serial</th>
              <th style={th}>Status</th>
              <th style={th}>Location</th>
              <th style={th}>Notes</th>
              <th style={{...th,textAlign:'right'}}>Cost</th>
              <th style={th}>Received</th>
              <th style={th}>Updated</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(it=>(
              <tr key={it.id}>
                <td style={td}><b>{it.model}</b></td>
                <td style={td}>{it.serial ?? '—'}</td>
                <td style={td}>{it.status}</td>
                <td style={td}>{it.location ?? '—'}</td>
                <td style={{...td,maxWidth:300}}>{it.notes ?? ''}</td>
                <td style={{...td,textAlign:'right'}}>{it.cost ? `$${it.cost.toFixed(2)}` : '—'}</td>
                <td style={td}>{it.receivedAt ?? '—'}</td>
                <td style={{...td,fontSize:12,color:'#64748b'}}>{new Date(it.updatedAt).toLocaleString()}</td>
                <td style={td}>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    <button style={btn} onClick={()=>{
                      const now = new Date().toISOString()
                      upsertLocal({...it, status:'Installed/Sold', updatedAt: now})
                    }}>Mark Sold</button>
                    <button style={btn} onClick={()=>{
                      const now = new Date().toISOString()
                      upsertLocal({...it, status:'Reserved', updatedAt: now})
                    }}>Reserve</button>
                    <button style={btn} onClick={()=>{
                      const now = new Date().toISOString()
                      upsertLocal({...it, status:'Display', location:'Showroom', updatedAt: now})
                    }}>To Showroom</button>
                    <button style={{...btn,borderColor:'#ef4444',color:'#ef4444'}} onClick={()=>{
                      const next = items.filter(x=>x.id!==it.id)
                      setItems(next)
                      // optional: delete in supabase
                      if (supabase && authed) supabase.from('inventory_items').delete().eq('id', it.id).then()
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td style={{...td,color:'#64748b'}} colSpan={9}>No items.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { textAlign:'left', padding:12 }
const td: React.CSSProperties = { padding:12, borderTop:'1px solid #f1f5f9' }
