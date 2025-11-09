import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

type Status = 'Stock' | 'Display' | 'Open Box' | 'Ordered' | 'Reserved' | 'Installed/Sold' | 'Returned'

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
}

const STATUSES: Status[] = ['Stock','Display','Open Box','Ordered','Reserved','Installed/Sold','Returned']

// ==== QUICK PASSWORD GATE (simple overlay) ====
const GATE_PASSWORD = '4seasons'; // change me
function PasswordGate({onUnlock}:{onUnlock:()=>void}) {
  const [pw,setPw]=useState('')
  const [err,setErr]=useState('')
  return (
    <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center',background:'#f8fafc'}}>
      <div style={{border:'1px solid #e5e7eb',padding:16,borderRadius:12,width:340,background:'#fff'}}>
        <div style={{fontWeight:700,marginBottom:8}}>Enter Password</div>
        <input type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)}
               style={{width:'100%',padding:'8px 10px',border:'1px solid #cbd5e1',borderRadius:8}} />
        {err && <div style={{color:'#b91c1c',fontSize:12,marginTop:6}}>{err}</div>}
        <button onClick={()=>{ if(pw===GATE_PASSWORD){ localStorage.setItem('gate_ok','1'); onUnlock(); } else setErr('Wrong password'); }}
                style={{marginTop:10,width:'100%',padding:'8px 12px',background:'#2563eb',color:'#fff',border:'1px solid #2563eb',borderRadius:8}}>
          Unlock
        </button>
      </div>
    </div>
  )
}

// ==== CSV utils ====
function csvEscape(v: any){ if(v==null) return ''; const s=String(v); return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s }
function toCSV(rows: Item[]){
  const header = ['Model','Serial','Status','Location','Notes','Cost','ReceivedAt','UpdatedAt'].join(',')
  const body = rows.map(r=>[
    r.model, r.serial??'', r.status, r.location??'', r.notes??'', r.cost??'', r.received_at??'', r.updated_at
  ].map(csvEscape).join(',')).join('\n')
  return header+'\n'+body
}

// ==== Scanner modal using BarcodeDetector with manual fallback ====
function ScannerModal({open,mode,onClose,onScan}:{open:boolean,mode:'IN'|'OUT',onClose:()=>void,onScan:(code:string)=>void}){
  const videoRef = useRef<HTMLVideoElement|null>(null)
  const [supported,setSupported]=useState(false)
  const [manual,setManual]=useState('')
  const [err,setErr]=useState('')
  const rafRef = useRef<number>()
  const streamRef = useRef<MediaStream|null>(null)

  useEffect(()=>{
    if(!open) return
    setErr(''); setManual('')
    let cancel=false
    ;(async()=>{
      try{
        const hasBD = typeof (window as any).BarcodeDetector!=='undefined'
        setSupported(hasBD)
        const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
        if(cancel) return
        streamRef.current = stream
        if(videoRef.current){ (videoRef.current as any).srcObject = stream; await (videoRef.current as any).play() }
        if(hasBD){
          const det = new (window as any).BarcodeDetector({formats:['qr_code','code_128','ean_13','ean_8','upc_a','upc_e']})
          const tick = async ()=>{
            try{
              if(videoRef.current){
                const res = await det.detect(videoRef.current)
                if(res?.length){ const v = res[0].rawValue; if(v){ onScan(v); return } }
              }
            }catch{}
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
        }
      }catch(e:any){ setErr(e?.message||'Camera error') }
    })()
    return ()=>{
      if(rafRef.current) cancelAnimationFrame(rafRef.current)
      const s=streamRef.current; streamRef.current=null; if(s) s.getTracks().forEach(t=>t.stop())
    }
  },[open])

  if(!open) return null
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div style={{background:'#fff',borderRadius:12,padding:16,width:'min(720px,95vw)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <b>Scan to {mode==='IN'?'ADD (IN)':'REMOVE (OUT)'} inventory</b>
          <button onClick={onClose} style={{border:'1px solid #cbd5e1',borderRadius:8,padding:'6px 10px'}}>✕</button>
        </div>
        {supported
          ? <video ref={videoRef} style={{width:'100%',borderRadius:12,background:'#000'}} muted playsInline />
          : <div style={{fontSize:12,color:'#444'}}>BarcodeDetector not supported. Use manual input.</div>}
        {err && <div style={{color:'#b91c1c',fontSize:12,marginTop:6}}>{err}</div>}
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Type or paste code" style={{flex:1,padding:'8px 10px',border:'1px solid #cbd5e1',borderRadius:8}} />
          <button onClick={()=>manual.trim() && onScan(manual.trim())} style={{padding:'8px 12px',background:'#2563eb',color:'#fff',border:'1px solid #2563eb',borderRadius:8}}>Submit</button>
        </div>
      </div>
    </div>
  )
}

export default function App(){
  // gate
  const [gateOK,setGateOK] = useState(() => localStorage.getItem('gate_ok')==='1')
  // auth
  const [user,setUser] = useState<any>(null)

  // ui state
  const [items,setItems]=useState<Item[]>([])
  const [q,setQ]=useState('')
  const [status,setStatus]=useState<string>('all')
  const [loc,setLoc]=useState<string>('all')
  const [modalOpen,setModalOpen]=useState(false)
  const [editing,setEditing]=useState<Item|null>(null)
  const [scanOpen,setScanOpen]=useState(false)
  const [scanMode,setScanMode]=useState<'IN'|'OUT'>('IN')
  const fileRef = useRef<HTMLInputElement>(null)

  // load auth + data
  useEffect(()=>{
    (async()=>{
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      await refresh()
      // realtime
      supabase.channel('inv-db')
        .on('postgres_changes',{event:'*',schema:'public',table:'inventory_items'}, ()=>refresh())
        .subscribe()
    })()
  },[])

  async function refresh(){
    const { data, error } = await supabase
      .from<Item>('inventory_items')
      .select('*')
      .order('updated_at',{ascending:false})
    if(!error && data) setItems(data)
  }

  async function upsert(it: Partial<Item>){
    const payload: any = {
      id: it.id,
      model: it.model || 'UNKNOWN',
      serial: it.serial ?? null,
      status: (it.status as Status) || 'Stock',
      location: it.location ?? null,
      notes: it.notes ?? null,
      cost: it.cost ?? null,
      received_at: it.received_at ?? null
    }
    const { error } = await supabase.from('inventory_items').upsert(payload).select()
    if(error) alert(error.message)
  }
  async function remove(id: string){
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if(error) alert(error.message)
  }

  function filtered(){
    const t=q.trim().toLowerCase()
    return items.filter(i=>{
      const hay=[i.model,i.serial,i.status,i.location,i.notes].filter(Boolean).join(' ').toLowerCase()
      const okQ=!t||hay.includes(t)
      const okS=status==='all'||i.status===status
      const okL=loc==='all'||(i.location??'').toLowerCase().includes(loc.toLowerCase())
      return okQ&&okS&&okL
    })
  }

  function exportCSV(){
    const csv = toCSV(filtered())
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='inventory.csv'; a.click(); URL.revokeObjectURL(url)
  }

  async function importCSV(f: File){
    const text = await f.text()
    const lines = text.trim().split(/\r?\n/)
    const head = lines.shift()?.split(',').map(s=>s.trim().toLowerCase())||[]
    const idx = (k:string)=>head.indexOf(k)
    const toNum = (s:string)=> s?Number(s):null
    for(const row of lines){
      const cols = row.match(/([^",]+|"([^"]|"")*")+/g) || []
      const get = (k:string) => {
        const j=idx(k); if(j<0) return ''
        const raw = cols[j]||''; return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1,-1).replaceAll('""','"') : raw
      }
      await upsert({
        model: get('model') || 'UNKNOWN',
        serial: get('serial') || null,
        status: (get('status') as Status) || 'Stock',
        location: get('location') || null,
        notes: get('notes') || null,
        cost: toNum(get('cost')),
        received_at: get('receivedat') || null
      })
    }
  }

  async function onScanned(code:string){
    setScanOpen(false)
    const parts = code.includes('|') ? code.split('|') : []
    const model = parts[0]?.trim() || 'UNKNOWN'
    const serial = (parts[1] || code).trim()
    // find by serial
    const found = items.find(i => (i.serial??'').toLowerCase()===serial.toLowerCase())
    if(scanMode==='IN'){
      if(found){
        await upsert({ ...found, status:'Stock' })
      }else{
        await upsert({ model, serial, status:'Stock' })
      }
    }else{
      if(found){
        await upsert({ ...found, status:'Installed/Sold' })
      }else{
        await upsert({ model, serial, status:'Installed/Sold', notes:'Scanned OUT (placeholder)' })
      }
    }
  }

  if(!gateOK) return <PasswordGate onUnlock={()=>setGateOK(true)} />

  return (
    <div style={{maxWidth:1100,margin:'0 auto',padding:16,fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,Arial'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <div style={{fontSize:20,fontWeight:700}}>4Seasons / Gaslight — Inventory</div>
        <span style={{flex:1}} />
        {user
          ? <button onClick={()=>supabase.auth.signOut().then(()=>setUser(null))} style={{padding:'6px 10px',border:'1px solid #cbd5e1',borderRadius:8}}>Sign out</button>
          : <button onClick={()=>supabase.auth.signInWithOtp({ email: prompt('Email to login (magic link):')||'' }).then(()=>alert('Check your email for a magic link'))}
                    style={{padding:'6px 10px',border:'1px solid #cbd5e1',borderRadius:8}}>Sign in</button>}
      </div>

      {/* Controls */}
      <div style={{border:'1px solid #e5e7eb',borderRadius:12,padding:12,marginBottom:12}}>
        <div style={{fontWeight:600,marginBottom:8}}>Search & Filters</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <input placeholder="Search model / serial / notes / location" value={q} onChange={e=>setQ(e.target.value)}
                 style={{flex:1,minWidth:220,padding:'8px 10px',border:'1px solid #cbd5e1',borderRadius:8}} />
          <select value={status} onChange={e=>setStatus(e.target.value)} style={{padding:'8px 10px',border:'1px solid #cbd5e1',borderRadius:8}}>
            <option value="all">All</option>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <input placeholder="Location filter" value={loc==='all'?'':loc} onChange={e=>setLoc(e.target.value||'all')}
                 style={{padding:'8px 10px',border:'1px solid #cbd5e1',borderRadius:8}} />
        </div>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <button onClick={()=>{ setEditing(null); setModalOpen(true) }} style={{padding:'8px 12px',background:'#2563eb',color:'#fff',border:'1px solid #2563eb',borderRadius:8}}>+ Add Item</button>
        <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>{ const f=e.target.files?.[0]; if(f) importCSV(f); (e.currentTarget as any).value='' }} />
        <button onClick={()=>fileRef.current?.click()} style={{padding:'8px 12px',border:'1px solid #cbd5e1',borderRadius:8}}>Import CSV</button>
        <button onClick={exportCSV} style={{padding:'8px 12px',border:'1px solid #cbd5e1',borderRadius:8}}>Export CSV</button>
        <span style={{flex:1}} />
        <button onClick={()=>{ setScanMode('IN'); setScanOpen(true) }} style={{padding:'8px 12px',border:'1px solid #cbd5e1',borderRadius:8}}>📷 Scan IN</button>
        <button onClick={()=>{ setScanMode('OUT'); setScanOpen(true) }} style={{padding:'8px 12px',border:'1px solid #cbd5e1',borderRadius:8}}>📷 Scan OUT</button>
      </div>

      {/* Table */}
      <div style={{overflowX:'auto',borderRadius:12,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
          <thead>
            <tr>
              <th style={th}>Model</th><th style={th}>Serial</th><th style={th}>Status</th><th style={th}>Location</th>
              <th style={th}>Notes</th><th style={{...th,textAlign:'right'}}>Cost</th><th style={th}>Received</th><th style={th}>Updated</th><th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered().map(it=>(
              <tr key={it.id}>
                <td style={td}><b>{it.model}</b></td>
                <td style={td}>{it.serial||'—'}</td>
                <td style={td}><span style={badge}>{it.status}</span></td>
                <td style={td}>{it.location||'—'}</td>
                <td style={{...td,maxWidth:280}} title={it.notes||''}>{it.notes||''}</td>
                <td style={{...td,textAlign:'right'}}>{it.cost!=null? `$${Number(it.cost).toFixed(2)}`:'—'}</td>
                <td style={td}>{it.received_at||'—'}</td>
                <td style={{...td,fontSize:12,color:'#64748b'}}>{new Date(it.updated_at).toLocaleString()}</td>
                <td style={td}>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    <button style={btn} onClick={()=>setEditing(it)}>Edit</button>
                    <button style={btn} onClick={()=>upsert({...it,status:'Installed/Sold'})}>Mark Sold</button>
                    <button style={btn} onClick={()=>upsert({...it,status:'Reserved'})}>Reserve</button>
                    <button style={btn} onClick={()=>upsert({...it,status:'Display',location:'Showroom'})}>To Showroom</button>
                    <button style={btn} onClick={()=>remove(it.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.3)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:12,padding:16,width:'min(680px,92vw)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <b>{editing?'Edit Item':'Add Item'}</b>
              <button style={btn} onClick={()=>{setModalOpen(false); setEditing(null)}}>✕</button>
            </div>
            <Form initial={editing||{}} onSave={(v)=>{ upsert(v).then(()=>{setModalOpen(false); setEditing(null)}) }} />
          </div>
        </div>
      )}

      {/* Scanner */}
      <ScannerModal open={scanOpen} mode={scanMode} onClose={()=>setScanOpen(false)} onScan={onScanned} />
    </div>
  )
}

function Form({initial,onSave}:{initial:Partial<Item>,onSave:(v:any)=>void}){
  const [model,setModel]=useState(initial.model||'')
  const [serial,setSerial]=useState(initial.serial||'')
  const [status,setStatus]=useState<Status>((initial.status as Status)||'Stock')
  const [location,setLocation]=useState(initial.location||'')
  const [notes,setNotes]=useState(initial.notes||'')
  const [cost,setCost]=useState(initial.cost!=null? String(initial.cost):'')
  const [received,setReceived]=useState(initial.received_at||'')

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      <L label="Model"><input value={model} onChange={e=>setModel(e.target.value)} style={inp}/></L>
      <L label="Serial"><input value={serial as any} onChange={e=>setSerial(e.target.value)} style={inp}/></L>
      <L label="Status">
        <select value={status} onChange={e=>setStatus(e.target.value as Status)} style={inp as any}>
          {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </L>
      <L label="Location"><input value={location as any} onChange={e=>setLocation(e.target.value)} style={inp}/></L>
      <L label="Notes" full><textarea value={notes as any} onChange={e=>setNotes(e.target.value)} style={{...inp,width:'100%',minHeight:64}}/></L>
      <L label="Cost"><input type="number" value={cost} onChange={e=>setCost(e.target.value)} style={inp}/></L>
      <L label="Received"><input type="date" value={received||''} onChange={e=>setReceived(e.target.value)} style={inp}/></L>
      <div style={{gridColumn:'1 / span 2',display:'flex',justifyContent:'flex-end',gap:8}}>
        <button style={{...btn,background:'#2563eb',color:'#fff',borderColor:'#2563eb'}} onClick={()=>{
          onSave({
            id: (initial as any).id,
            model: model.trim()||'UNKNOWN',
            serial: serial? String(serial): null,
            status, location: location||null, notes: notes||null,
            cost: cost? Number(cost): null,
            received_at: received||null
          })
        }}>Save</button>
      </div>
    </div>
  )
}

function L({label,children,full}:{label:string,children:any,full?:boolean}){
  return <div style={{gridColumn: full?'1 / span 2':undefined}}>
    <div style={{fontSize:12,color:'#475569',marginBottom:4}}>{label}</div>
    {children}
  </div>
}

const th: React.CSSProperties = {textAlign:'left',padding:12,background:'#f8fafc',color:'#475569',borderBottom:'1px solid #e5e7eb'}
const td: React.CSSProperties = {padding:12,borderTop:'1px solid #f1f5f9'}
const badge: React.CSSProperties = {border:'1px solid #cbd5e1',borderRadius:999,padding:'2px 8px',fontSize:12}
const btn: React.CSSProperties = {padding:'6px 10px',border:'1px solid #cbd5e1',borderRadius:8,cursor:'pointer'}
const inp: React.CSSProperties = {padding:'8px 10px',border:'1px solid #cbd5e1',borderRadius:8,width:'100%'}
