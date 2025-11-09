import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

/** ==============================
 *  Types / constants
 *  ============================== */
const STATUSES = [
  'Stock', 'Display', 'Open Box', 'Ordered', 'Reserved', 'Installed/Sold', 'Returned'
] as const
type Status = typeof STATUSES[number]

type Item = {
  id: string
  model: string
  serial?: string | null
  status: Status
  location?: string | null
  notes?: string | null
  cost?: number | null
  received_at?: string | null
  updated_at: string
  created_at?: string
}

/** ==============================
 *  Local utils
 *  ============================== */
const styles = {
  container: { maxWidth: 1100, margin: '0 auto', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' },
  h1: { fontSize: 22, margin: '8px 0 4px' },
  muted: { color: '#666', fontSize: 12 },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 16 },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  input: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8 },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8 },
  button: { padding: '8px 12px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8, cursor: 'pointer' },
  buttonPrimary: { padding: '8px 12px', border: '1px solid #2563eb', background: '#2563eb', color: 'white', borderRadius: 8, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto' as const, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { textAlign: 'left' as const, padding: 12, background: '#f8fafc', color: '#475569' },
  td: { padding: 12, borderTop: '1px solid #f1f5f9' },
  badge: { border: '1px solid #cbd5e1', borderRadius: 999, padding: '2px 8px', fontSize: 12 },
  stat: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, textAlign: 'center' as const },
}

/** CSV helpers (kept) */
function csvEscape(v: any) {
  if (v === undefined || v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s
}
function downloadCSV(filename: string, rows: Item[]) {
  const header = ['Model','Serial','Status','Location','Notes','Cost','ReceivedAt','UpdatedAt']
  const lines = [header.join(',')].concat(
    rows.map(r => [
      r.model, r.serial ?? '', r.status, r.location ?? '', r.notes ?? '',
      r.cost ?? '', r.received_at ?? '', r.updated_at
    ].map(csvEscape).join(','))
  )
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}
function parseCSV(text: string): Partial<Item>[] {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
  const header = lines[0].split(',').map(s=>s.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name.toLowerCase())
  const out: Partial<Item>[] = []
  for (let i=1;i<lines.length;i++){
    const row = lines[i]
    const cols = row.match(/([^",]+|"(?:[^"]|"")*")+/g) || []
    const get = (n: string) => {
      const j = idx(n); if (j<0) return ''
      const raw = cols[j] || ''
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1,-1).replaceAll('""','"') : raw
    }
    out.push({
      model: get('Model') || 'UNKNOWN',
      serial: get('Serial') || null,
      status: (get('Status') as Status) || 'Stock',
      location: get('Location') || null,
      notes: get('Notes') || null,
      cost: get('Cost') ? Number(get('Cost')) : null,
      received_at: get('ReceivedAt') || null,
      updated_at: get('UpdatedAt') || new Date().toISOString()
    })
  }
  return out
}

/** ==============================
 *  Scanner (BarcodeDetector with fallback)
 *  ============================== */
function ScannerModal({
  open, mode, onClose, onScanned
}: { open:boolean, mode:'IN'|'OUT', onClose:()=>void, onScanned:(code:string)=>void }) {
  const videoRef = useRef<HTMLVideoElement|null>(null)
  const [supported, setSupported] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const hasBarcode = typeof (window as any).BarcodeDetector !== 'undefined'
        setSupported(hasBarcode)
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled) return
        if (videoRef.current) {
          ;(videoRef.current as any).srcObject = stream
          await (videoRef.current as any).play()
        }
        if (hasBarcode) {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code','code_128','ean_13','ean_8','upc_a','upc_e'] })
          const loop = async () => {
            if (!videoRef.current) return
            try {
              const res = await detector.detect(videoRef.current)
              if (res && res.length) {
                const payload = res[0].rawValue
                if (payload) onScanned(String(payload))
              }
            } catch {}
            requestAnimationFrame(loop)
          }
          requestAnimationFrame(loop)
        }
      } catch (e:any) {
        setError(e?.message || 'Camera access failed')
      }
    })()
    return () => {
      const vid = videoRef.current
      const s = (vid && (vid as any).srcObject) as MediaStream | null
      if (s) s.getTracks().forEach(t=>t.stop())
    }
  }, [open])

  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'min(720px,95vw)', padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>Scan to {mode==='IN' ? 'ADD (IN)' : 'REMOVE (OUT)'}</div>
          <button style={styles.button as any} onClick={onClose}>✕</button>
        </div>
        <div style={{ display:'grid', gap:12 }}>
          {supported
            ? <video ref={videoRef} style={{ width:'100%', borderRadius:12, background:'#000' }} muted playsInline/>
            : <div style={{...styles.muted}}>BarcodeDetector not supported. Use manual code below.</div>
          }
          {error && <div style={{ color:'#b91c1c', fontSize:13 }}>{error}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Manual code" style={{...styles.input, flex:1} as any}/>
            <button style={styles.buttonPrimary as any} onClick={()=>{ if (manual.trim()) onScanned(manual.trim()) }}>Submit</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** ==============================
 *  Main App (Supabase sync)
 *  ============================== */
export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [locFilter, setLocFilter] = useState<string>('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanMode, setScanMode] = useState<'IN'|'OUT'>('IN')
  const fileRef = useRef<HTMLInputElement>(null)

  // Initial load + realtime
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from('items').select('*').order('updated_at', { ascending: false })
      if (!error && data) setItems(data as Item[])
    })()

    const ch = supabase
      .channel('items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, payload => {
        const row = payload.new as Item
        const old = payload.old as Item
        setItems(prev => {
          if (payload.eventType === 'INSERT') return [row, ...prev]
          if (payload.eventType === 'UPDATE') return prev.map(i => i.id === row.id ? row : i)
          if (payload.eventType === 'DELETE') return prev.filter(i => i.id !== old.id)
          return prev
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return items.filter(it => {
      const hay = [it.model, it.serial ?? '', it.status, it.location ?? '', it.notes ?? ''].join(' ').toLowerCase()
      const okQ = !t || hay.includes(t)
      const okS = statusFilter === 'all' || it.status === statusFilter
      const okL = locFilter === 'all' || (it.location ?? '').toLowerCase().includes(locFilter.toLowerCase())
      return okQ && okS && okL
    })
  }, [items, q, statusFilter, locFilter])

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {}
    filtered.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1 })
    return { byStatus, total: filtered.length }
  }, [filtered])

  async function upsertItem(p: Partial<Item> & { id?: string }) {
    const now = new Date().toISOString()
    const payload: any = {
      id: p.id, model: p.model ?? 'UNKNOWN',
      serial: p.serial ?? null, status: (p.status as Status) ?? 'Stock',
      location: p.location ?? null, notes: p.notes ?? null,
      cost: p.cost ?? null, received_at: p.received_at ?? null,
      updated_at: now
    }
    const { data, error } = await supabase.from('items').upsert(payload).select().single()
    if (error) alert('Save failed: ' + error.message)
    else setItems(prev => {
      const idx = prev.findIndex(x => x.id === data.id)
      return idx >= 0 ? prev.map(x => x.id === data.id ? data as Item : x) : [data as Item, ...prev]
    })
    setEditing(null); setOpen(false)
  }

  async function deleteItem(id: string) {
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) alert('Delete failed: ' + error.message)
  }

  async function importCSV(file: File) {
    const text = await file.text()
    const rows = parseCSV(text)
    for (const r of rows) await supabase.from('items').insert({ ...r, updated_at: new Date().toISOString() })
  }

  function handleScanned(code: string) {
    setScanOpen(false)
    const [maybeModel, maybeSerial] = code.includes('|') ? code.split('|') : [undefined, code]
    if (scanMode === 'IN') {
      upsertItem({ model: maybeModel || 'UNKNOWN', serial: maybeSerial, status: 'Stock' })
    } else {
      upsertItem({ model: maybeModel || 'UNKNOWN', serial: maybeSerial, status: 'Installed/Sold' })
    }
  }

  return (
    <div style={styles.container as any}>
      <div style={{ marginBottom: 12 }}>
        <div style={styles.h1 as any}>4Seasons / Gaslight — Inventory Manager</div>
        <div style={styles.muted as any}>Supabase-backed (realtime sync). Scanner works on HTTPS.</div>
      </div>

      {/* Controls */}
      <div style={styles.card as any}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Search & Filters</div>
        <div style={{...styles.row, alignItems: 'flex-end'}}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div>Search</div>
            <input placeholder="Model / Serial / Notes / Location" value={q} onChange={e=>setQ(e.target.value)} style={{...styles.input, width: '100%'} as any}/>
          </div>
          <div>
            <div>Status</div>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={styles.select as any}>
              <option value="all">All</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div>Location filter</div>
            <input placeholder="Shop / Showroom / Truck" value={locFilter==='all'?'':locFilter} onChange={e=>setLocFilter(e.target.value || 'all')} style={styles.input as any}/>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{...styles.row, marginBottom: 12}}>
        <button style={styles.buttonPrimary as any} onClick={()=>setOpen(true)}>+ Add Item</button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f) importCSV(f); (e.currentTarget as any).value='' }}/>
        <button style={styles.button as any} onClick={()=>fileRef.current?.click()}>Import CSV</button>
        <button style={styles.button as any} onClick={()=>downloadCSV(`inventory-${new Date().toISOString().slice(0,10)}.csv`, filtered)}>Export CSV (filtered)</button>
        <span style={{ flex: 1 }} />
        <button style={styles.button as any} onClick={()=>{ setScanMode('IN'); setScanOpen(true) }}>📷 Scan IN</button>
        <button style={styles.button as any} onClick={()=>{ setScanMode('OUT'); setScanOpen(true) }}>📷 Scan OUT</button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <div style={styles.stat as any}><div style={styles.muted as any}>Total</div><div style={{ fontSize: 22, fontWeight: 600 }}>{stats.total}</div></div>
        {Object.entries(stats.byStatus).map(([k,v]) => (
          <div key={k} style={styles.stat as any}><div style={styles.muted as any}>{k}</div><div style={{ fontSize: 22, fontWeight: 600 }}>{v}</div></div>
        ))}
      </div>

      {/* Table */}
      <div style={styles.tableWrap as any}>
        <table style={styles.table as any}>
          <thead>
            <tr>
              <th style={styles.th as any}>Model</th>
              <th style={styles.th as any}>Serial</th>
              <th style={styles.th as any}>Status</th>
              <th style={styles.th as any}>Location</th>
              <th style={styles.th as any}>Notes</th>
              <th style={{...styles.th, textAlign:'right'} as any}>Cost</th>
              <th style={styles.th as any}>Received</th>
              <th style={styles.th as any}>Updated</th>
              <th style={styles.th as any}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td style={styles.td as any}><b>{item.model}</b></td>
                <td style={styles.td as any}>{item.serial ?? '—'}</td>
                <td style={styles.td as any}><span style={styles.badge as any}>{item.status}</span></td>
                <td style={styles.td as any}>{item.location ?? '—'}</td>
                <td style={{...styles.td, maxWidth: 280} as any} title={item.notes ?? ''}>{item.notes ?? ''}</td>
                <td style={{...styles.td, textAlign:'right'} as any}>{item.cost != null ? `$${Number(item.cost).toFixed(2)}` : '—'}</td>
                <td style={styles.td as any}>{item.received_at ?? '—'}</td>
                <td style={{...styles.td, fontSize: 12, color:'#64748b'} as any}>{new Date(item.updated_at).toLocaleString()}</td>
                <td style={styles.td as any}>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                    <button style={styles.button as any} onClick={()=>setEditing(item)}>Edit</button>
                    <button style={styles.button as any} onClick={()=>deleteItem(item.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <Modal open={open || !!editing} title={editing? 'Edit item' : 'Add item'} onClose={()=>{ setOpen(false); setEditing(null) }}>
        <InventoryForm initial={editing ?? undefined} onSubmit={upsertItem} />
      </Modal>

      <ScannerModal open={scanOpen} mode={scanMode} onClose={()=>setScanOpen(false)} onScanned={handleScanned} />

      <div style={{...styles.muted, marginTop: 12}}>
        💡 Scan format accepted: <code>MODEL|SERIAL</code> or just <code>SERIAL</code>. Realtime sync via Supabase.
      </div>
    </div>
  )
}

/** Modal + form (kept minimal) */
function Modal({open, title, onClose, children}:{open:boolean, title:string, onClose:()=>void, children:React.ReactNode}) {
  if(!open) return null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div style={{ background:'#fff', borderRadius:12, padding:16, width:'min(680px,92vw)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontWeight:600 }}>{title}</div>
          <button style={styles.button as any} onClick={onClose}>✕</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}
function InventoryForm({initial, onSubmit}:{initial?: Partial<Item>, onSubmit:(i:Partial<Item>)=>void}) {
  const [model,setModel] = useState(initial?.model || '')
  const [serial,setSerial] = useState(initial?.serial || '')
  const [status,setStatus] = useState<Status>((initial?.status as Status) || 'Stock')
  const [location,setLocation] = useState(initial?.location || '')
  const [notes,setNotes] = useState(initial?.notes || '')
  const [cost,setCost] = useState(initial?.cost != null ? String(initial?.cost) : '')
  const [receivedAt,setReceivedAt] = useState(initial?.received_at || '')

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
      <div><div>Model</div><input style={styles.input as any} value={model} onChange={e=>setModel(e.target.value)} /></div>
      <div><div>Serial</div><input style={styles.input as any} value={serial} onChange={e=>setSerial(e.target.value)} /></div>
      <div>
        <div>Status</div>
        <select style={styles.select as any} value={status} onChange={e=>setStatus(e.target.value as Status)}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div><div>Location</div><input style={styles.input as any} value={location} onChange={e=>setLocation(e.target.value)} /></div>
      <div style={{ gridColumn:'1 / span 2' }}>
        <div>Notes</div>
        <textarea style={{...styles.input, width:'100%', minHeight:64} as any} value={notes} onChange={e=>setNotes(e.target.value)} />
      </div>
      <div><div>Cost</div><input type="number" style={styles.input as any} value={cost} onChange={e=>setCost(e.target.value)} /></div>
      <div><div>Received At</div><input type="date" style={styles.input as any} value={receivedAt} onChange={e=>setReceivedAt(e.target.value)} /></div>
      <div style={{ gridColumn:'1 / span 2', display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button style={styles.buttonPrimary as any} onClick={() => onSubmit({
          id: (initial as any)?.id,
          model: model.trim() || 'UNKNOWN',
          serial: serial.trim() || null,
          status, location: location.trim() || null,
          notes: notes.trim() || null,
          cost: cost ? Number(cost) : null,
          received_at: receivedAt || null
        })}>Save</button>
      </div>
    </div>
  )
}
