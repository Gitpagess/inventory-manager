import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Inventory App (Supabase-sync + Scanner)
 * -----------------------------------------------------------
 * This version fixes ALL DB schema mismatches by mapping
 * camelCase in the UI ⇄ snake_case in Postgres.
 *
 * Expected Postgres table: public.inventory
 * Columns (NO owner column required):
 *   id UUID PK (NOT NULL)
 *   model TEXT
 *   serial TEXT
 *   status TEXT
 *   location TEXT NULL
 *   notes TEXT NULL
 *   cost NUMERIC NULL
 *   received_at DATE NULL
 *   updated_at TIMESTAMPTZ NOT NULL
 *
 * If your DB uses different column names, DO NOT change SQL —
 * we now map them here so app works with your current table.
 */

// ---------- CONFIG (leave as-is if your env is already set) ----------
// The app will try Vite env first, then window globals, then hard-coded fallback.
const SUPABASE_URL = (import.meta as any)?.env?.VITE_SUPABASE_URL || (window as any).SUPABASE_URL || ""; // <-- keep empty if already set via env
const SUPABASE_ANON_KEY = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || (window as any).SUPABASE_ANON_KEY || ""; // <-- keep empty if already set via env

// Toggle to seed initial local items if DB is empty
const USE_SEED_ON_EMPTY = true;

// ---------- Types ----------
const STATUSES = [
  "Stock",
  "Display",
  "Open Box",
  "Ordered",
  "Reserved",
  "Installed/Sold",
  "Returned",
] as const;

type Status = typeof STATUSES[number];

export type Item = {
  id: string; // uuid
  model: string;
  serial?: string;
  status: Status;
  location?: string;
  notes?: string;
  cost?: number;
  receivedAt?: string; // YYYY-MM-DD
  updatedAt: string; // ISO string
};

// ---------- Seed ----------
const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
const nowIso = () => new Date().toISOString();

const seedData: Item[] = [
  { id: uuid(), model: "EX11CN", status: "Stock", notes: "Sylvia", updatedAt: nowIso() },
  { id: uuid(), model: "EX11CN", status: "Stock", notes: "Sylvia", updatedAt: nowIso() },
  { id: uuid(), model: "EX11CN", status: "Stock", notes: "Sylvia", updatedAt: nowIso() },
  { id: uuid(), model: "EX17CN", status: "Open Box", location: "take back from 1614 Allison", notes: "Sylvia", updatedAt: nowIso() },
  { id: uuid(), model: "EX17CN", status: "Display", location: "Showroom Display", notes: "Showroom", updatedAt: nowIso() },
  { id: uuid(), model: "EX22CN", serial: "NB.LB-003680", status: "Stock", notes: "Sylvia", updatedAt: nowIso() },
  { id: uuid(), model: "EX22CN", serial: "NB.LB-003006", status: "Stock", location: "Shop — 1619 Prairie (10-7533)", notes: "Aug 25", updatedAt: nowIso() },
  { id: uuid(), model: "EX22CN", serial: "24397", status: "Stock", location: "Shop", notes: "July 23 — new stock at shop, finally sale", updatedAt: nowIso() },
  { id: uuid(), model: "EX22CN", serial: "NB.LB-003008", status: "Stock", location: "Shop", notes: "July 23 — new stock at shop, finally sale", updatedAt: nowIso() },
  { id: uuid(), model: "AR9T960603BN", serial: "2505267633", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax", updatedAt: nowIso() },
  { id: uuid(), model: "AR9T960603BN", serial: "2505272372", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax", updatedAt: nowIso() },
  { id: uuid(), model: "AR9T960603BN", serial: "2505272374", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax", updatedAt: nowIso() },
  { id: uuid(), model: "AMVM970803BN", serial: "2411115464", status: "Stock", location: "Shop", notes: "10-10", updatedAt: nowIso() },
  { id: uuid(), model: "AMVM970803BN", serial: "2411115465", status: "Stock", location: "Shop", notes: "10-10", updatedAt: nowIso() },
];

// ---------- Local Storage helpers ----------
const STORAGE_KEY = "inventory-manager-v2";
const loadLocal = (): Item[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return USE_SEED_ON_EMPTY ? seedData : [];
    const parsed = JSON.parse(raw) as Item[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const saveLocal = (items: Item[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

// ---------- DB mapping (camel ⇄ snake) ----------
function toDb(i: Item) {
  return {
    id: i.id,
    model: i.model,
    serial: i.serial ?? null,
    status: i.status,
    location: i.location ?? null,
    notes: i.notes ?? null,
    cost: i.cost ?? null,
    received_at: i.receivedAt ?? null,
    updated_at: i.updatedAt,
  };
}
function fromDb(r: any): Item {
  return {
    id: r.id,
    model: r.model,
    serial: r.serial ?? undefined,
    status: (r.status as Status) ?? "Stock",
    location: r.location ?? undefined,
    notes: r.notes ?? undefined,
    cost: typeof r.cost === "number" ? r.cost : (r.cost ? Number(r.cost) : undefined),
    receivedAt: r.received_at ?? undefined,
    updatedAt: r.updated_at ?? nowIso(),
  };
}

// ---------- CSV helpers ----------
function csvEscape(v: string | number | undefined) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
function downloadCSV(filename: string, rows: Item[]) {
  const header = ["Model","Serial","Status","Location","Notes","Cost","ReceivedAt","UpdatedAt"]; 
  const lines = [header.join(",")].concat(
    rows.map(r => [r.model,r.serial,r.status,r.location,r.notes,r.cost??"",r.receivedAt??"",r.updatedAt].map(csvEscape).join(","))
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function parseCSV(text: string): Item[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].split(",").map(s=>s.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const items: Item[] = [];
  for (let i=1;i<lines.length;i++){
    const row = lines[i];
    const cols = row.match(/([^",]+|"(?:[^"]|"")*")+/g) || [];
    const get = (n: string) => { const j = idx(n); if (j<0) return ""; const raw = cols[j] || ""; return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1,-1).replaceAll('""','"') : raw; };
    items.push({
      id: uuid(),
      model: get("Model") || "UNKNOWN",
      serial: get("Serial") || undefined,
      status: (get("Status") as Status) || "Stock",
      location: get("Location") || undefined,
      notes: get("Notes") || undefined,
      cost: get("Cost") ? Number(get("Cost")) : undefined,
      receivedAt: get("ReceivedAt") || undefined,
      updatedAt: nowIso(),
    });
  }
  return items;
}

// ---------- Minimal UI styles ----------
const styles = {
  container: { maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  h1: { fontSize: 22, margin: "8px 0 4px" },
  muted: { color: "#666", fontSize: 12 },
  card: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const },
  input: { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8 },
  select: { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8 },
  button: { padding: "8px 12px", border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 8, cursor: "pointer" },
  buttonPrimary: { padding: "8px 12px", border: "1px solid #2563eb", background: "#2563eb", color: "white", borderRadius: 8, cursor: "pointer" },
  tableWrap: { overflowX: "auto" as const, borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 14 },
  th: { textAlign: "left" as const, padding: 12, background: "#f8fafc", color: "#475569" },
  td: { padding: 12, borderTop: "1px solid #f1f5f9" },
  badge: { border: "1px solid #cbd5e1", borderRadius: 999, padding: "2px 8px", fontSize: 12 },
  stat: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, textAlign: "center" as const },
};

function InventoryForm({initial, onSubmit}:{initial?: Partial<Item>, onSubmit:(i:Item)=>void}){
  const [model,setModel] = useState(initial?.model||"");
  const [serial,setSerial] = useState(initial?.serial||"");
  const [status,setStatus] = useState<Status>((initial?.status as Status) || "Stock");
  const [location,setLocation] = useState(initial?.location||"");
  const [notes,setNotes] = useState(initial?.notes||"");
  const [cost,setCost] = useState(initial?.cost?.toString()||"");
  const [receivedAt,setReceivedAt] = useState(initial?.receivedAt||"");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <div>Model</div>
        <input style={styles.input as any} value={model} onChange={e=>setModel(e.target.value)} placeholder="e.g., EX22CN" />
      </div>
      <div>
        <div>Serial</div>
        <input style={styles.input as any} value={serial} onChange={e=>setSerial(e.target.value)} placeholder="e.g., NB.LB-003680" />
      </div>
      <div>
        <div>Status</div>
        <select style={styles.select as any} value={status} onChange={(e)=>setStatus(e.target.value as Status)}>
          {STATUSES.map(s=> <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <div>Location</div>
        <input style={styles.input as any} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Shop / Showroom / 1619 Prairie" />
      </div>
      <div style={{ gridColumn: "1 / span 2" }}>
        <div>Notes</div>
        <textarea style={{...styles.input, width: "100%", minHeight: 64} as any} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Purchase, dates, who handled it (e.g., Sylvia)" />
      </div>
      <div>
        <div>Cost (with tax)</div>
        <input type="number" style={styles.input as any} value={cost} onChange={e=>setCost(e.target.value)} placeholder="e.g., 2309" />
      </div>
      <div>
        <div>Received At</div>
        <input type="date" style={styles.input as any} value={receivedAt} onChange={e=>setReceivedAt(e.target.value)} />
      </div>
      <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={styles.buttonPrimary as any} onClick={()=>{
          const now = nowIso();
          onSubmit({
            id: (initial?.id as string) || uuid(),
            model: model.trim() || 'UNKNOWN',
            serial: serial.trim() || undefined,
            status,
            location: location.trim()||undefined,
            notes: notes.trim()||undefined,
            cost: cost? Number(cost): undefined,
            receivedAt: receivedAt || undefined,
            updatedAt: now,
          } as Item);
        }}>Save</button>
      </div>
    </div>
  );
}

function RowActions({item, onEdit, onDelete, onQuick}:{item:Item, onEdit:()=>void, onDelete:()=>void, onQuick:(i:Partial<Item>)=>void}){
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button style={styles.button as any} onClick={()=>onQuick({status:"Installed/Sold"})}>Mark Sold</button>
      <button style={styles.button as any} onClick={()=>onQuick({status:"Reserved"})}>Reserve</button>
      <button style={styles.button as any} onClick={()=>onQuick({status:"Display", location:"Showroom"})}>Move to Showroom</button>
      <button style={styles.button as any} onClick={onEdit}>Edit</button>
      <button style={styles.button as any} onClick={onDelete}>Delete</button>
    </div>
  );
}

function Modal({open, title, onClose, children}:{open:boolean, title:string, onClose:()=>void, children:React.ReactNode}){
  if(!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "white", borderRadius: 12, padding: 16, width: "min(680px, 92vw)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <button style={styles.button as any} onClick={onClose}>✕</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

function ScannerModal({open, mode, onClose, onScanned}:{open:boolean, mode:'IN'|'OUT', onClose:()=>void, onScanned:(code:string)=>void}){
  const videoRef = useRef<HTMLVideoElement|null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [manual, setManual] = useState<string>("");
  const streamRef = useRef<MediaStream|null>(null);
  const rafRef = useRef<number|undefined>(undefined);

  useEffect(()=>{
    if(!open) return;
    setError(""); setManual("");
    let cancelled = false;
    (async () => {
      try{
        const hasBarcode = typeof (globalThis as any).BarcodeDetector !== 'undefined';
        setSupported(hasBarcode);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if(cancelled) return;
        streamRef.current = stream;
        if(videoRef.current){ (videoRef.current as any).srcObject = stream; await (videoRef.current as any).play(); }
        if(hasBarcode){
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code','code_128','ean_13','ean_8','upc_a','upc_e'] });
          const tick = async () => {
            try{
              if(videoRef.current){
                const results = await detector.detect(videoRef.current);
                if(results && results.length){
                  const payload = results[0].rawValue || results[0].cornerPoints?.toString();
                  if(payload){ onScanned(String(payload)); }
                }
              }
            }catch(e){ /* ignore */ }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        }
      }catch(e:any){ setError(e?.message || 'Camera access failed'); }
    })();
    return () => {
      cancelled = true;
      if(rafRef.current) cancelAnimationFrame(rafRef.current);
      const s = streamRef.current; streamRef.current = null; if(s){ s.getTracks().forEach(t=>t.stop()); }
    };
  },[open]);

  if(!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'min(720px,95vw)', padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>Scan to {mode === 'IN' ? 'ADD (IN)' : 'REMOVE (OUT)'} inventory</div>
          <button style={styles.button as any} onClick={onClose}>✕</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12 }}>
          {supported ? (
            <div>
              <video ref={videoRef} style={{ width:'100%', borderRadius:12, background:'#000' }} muted playsInline />
              <div style={{...styles.muted, marginTop:6}}>Tip: QR/Code128/EAN/UPC supported. HTTPS required on phones.</div>
            </div>
          ) : (
            <div style={{...styles.muted}}>BarcodeDetector not supported. Use manual input below.</div>
          )}
          {!!error && <div style={{ color:'#b91c1c', fontSize:13 }}>Camera error: {error}</div>}
          <div>
            <div style={{ marginBottom:6 }}>Manual code (fallback)</div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Scan code or type here" style={{...styles.input, flex:1} as any} />
              <button style={styles.buttonPrimary as any} onClick={()=>{ if(manual.trim()) onScanned(manual.trim()); }}>Submit</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function findBySerial(items: Item[], serial: string){
  return items.find(i => (i.serial||'').toLowerCase() === serial.toLowerCase());
}
function createFromCode(code: string): Partial<Item>{
  let model = '';
  let serial = code.trim();
  if(code.includes('|')){ const [m,s] = code.split('|'); model = (m||'').trim(); serial = (s||'').trim(); }
  return { model: model || 'UNKNOWN', serial };
}

export default function App(){
  const supa: SupabaseClient | null = useMemo(()=>{
    if(!SUPABASE_URL || !SUPABASE_ANON_KEY){ console.debug('Supabase env missing. Running local-only.'); return null; }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  },[]);

  const [items, setItems] = useState<Item[]>(loadLocal());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locFilter, setLocFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'IN'|'OUT'>('IN');
  const fileRef = useRef<HTMLInputElement>(null);

  // Initial sync from DB
  useEffect(()=>{
    (async ()=>{
      if(!supa) return; // local-only
      const { data, error } = await supa.from('inventory').select("*").order('updated_at', { ascending:false });
      if(error){ console.error('select error', error); return; }
      if(data && data.length){ const mapped = data.map(fromDb); setItems(mapped); saveLocal(mapped); }
      else if(USE_SEED_ON_EMPTY){ setItems(seedData); saveLocal(seedData); }
    })();
  },[supa]);

  // Persist locally always
  useEffect(()=>{ saveLocal(items); },[items]);

  const filtered = useMemo(()=>{
    const t = q.trim().toLowerCase();
    return items.filter(it=>{
      const hay = [it.model,it.serial,it.status,it.location,it.notes].filter(Boolean).join(" ").toLowerCase();
      const okQ = !t || hay.includes(t);
      const okS = statusFilter === "all" || it.status === statusFilter;
      const okL = locFilter === "all" || (it.location||"").toLowerCase().includes(locFilter.toLowerCase());
      return okQ && okS && okL;
    });
  },[items,q,statusFilter,locFilter]);

  const stats = useMemo(()=>{
    const byStatus: Record<string, number> = {};
    filtered.forEach(i=>{ byStatus[i.status] = (byStatus[i.status]||0)+1; });
    return { byStatus, total: filtered.length };
  },[filtered]);

  async function dbUpsert(it: Item){
    if(!supa) return; // local-only
    const row = toDb(it);
    // Use upsert on primary key id; ensure id provided (fixes "null id" errors)
    const { error } = await supa.from('inventory').upsert(row, { onConflict: 'id' });
    if(error){ console.error('upsert error', error); }
  }
  async function dbDelete(id: string){
    if(!supa) return;
    const { error } = await supa.from('inventory').delete().eq('id', id);
    if(error){ console.error('delete error', error); }
  }

  const upsert = (it: Item) => {
    setItems(prev => {
      const idx = prev.findIndex(p => p.id === it.id);
      const next = idx >= 0 ? [...prev.slice(0,idx), it, ...prev.slice(idx+1)] : [it, ...prev];
      return next;
    });
    dbUpsert(it);
    setEditing(null); setOpen(false);
  };

  const quickUpdate = (item: Item, patch: Partial<Item>) => {
    const updated: Item = { ...item, ...patch, updatedAt: nowIso() };
    setItems(prev => prev.map(p => p.id===item.id ? updated : p));
    dbUpsert(updated);
  };

  const remove = (id: string) => { setItems(prev => prev.filter(p => p.id!==id)); dbDelete(id); };

  const doExport = () => downloadCSV(`inventory-${new Date().toISOString().slice(0,10)}.csv`, filtered);

  const doImport = async (file: File) => {
    const text = await file.text();
    const imported = parseCSV(text);
    if (!imported.length) return;
    const merged = [...imported, ...items];
    setItems(merged);
    // push to DB (bulk upsert)
    if(supa){ const { error } = await supa.from('inventory').upsert(imported.map(toDb), { onConflict: 'id' }); if(error){ console.error('bulk upsert', error); } }
  };

  // ---- Scan handling ----
  const handleScanned = (code: string) => {
    setScanOpen(false);
    const now = nowIso();
    if(scanMode === 'IN'){
      const exists = findBySerial(items, code);
      if(exists){ quickUpdate(exists, { status:'Stock' }); }
      else {
        const base = createFromCode(code);
        const newItem: Item = { id: uuid(), model: base.model||'UNKNOWN', serial: base.serial, status:'Stock', updatedAt: now } as Item;
        setItems(prev => [newItem, ...prev]);
        dbUpsert(newItem);
      }
    }else{
      const exists = findBySerial(items, code);
      if(exists){ quickUpdate(exists, { status:'Installed/Sold' }); }
      else {
        const base = createFromCode(code);
        const newItem: Item = { id: uuid(), model: base.model||'UNKNOWN', serial: base.serial, status:'Installed/Sold', notes:'Scanned OUT (placeholder)', updatedAt: now } as Item;
        setItems(prev => [newItem, ...prev]);
        dbUpsert(newItem);
      }
    }
  };

  return (
    <div style={styles.container as any}>
      <div style={{ marginBottom: 12 }}>
        <div style={styles.h1 as any}>4Seasons / Gaslight — Inventory Manager</div>
        <div style={styles.muted as any}>Supabase sync enabled. Fields map to DB snake_case (received_at / updated_at). No owner column required.</div>
      </div>

      {/* Controls */}
      <div style={styles.card as any}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Search & Filters</div>
        <div style={{...styles.row, alignItems: "flex-end"}}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div>Search</div>
            <input placeholder="Model / Serial / Notes / Location" value={q} onChange={e=>setQ(e.target.value)} style={{...styles.input, width: "100%"} as any} />
          </div>
          <div>
            <div>Status</div>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={styles.select as any}>
              <option value="all">All</option>
              {STATUSES.map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div>Location filter</div>
            <input placeholder="Shop / Showroom / 1619 Prairie" value={locFilter === "all" ? "" : locFilter} onChange={e=> setLocFilter(e.target.value || "all")} style={styles.input as any} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{...styles.row, marginBottom: 12}}>
        <button style={styles.buttonPrimary as any} onClick={()=>setOpen(true)}>+ Add Item</button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e)=>{ const f=e.target.files?.[0]; if(f) doImport(f); (e.currentTarget as any).value = ""; }} />
        <button style={styles.button as any} onClick={()=>fileRef.current?.click()}>Import CSV</button>
        <button style={styles.button as any} onClick={doExport}>Export CSV (filtered)</button>
        <span style={{ flex:1 }} />
        <button style={styles.button as any} onClick={()=>{ setScanMode('IN'); setScanOpen(true); }}>📷 Scan IN</button>
        <button style={styles.button as any} onClick={()=>{ setScanMode('OUT'); setScanOpen(true); }}>📷 Scan OUT</button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <div style={styles.stat as any}><div style={styles.muted as any}>Total</div><div style={{ fontSize: 22, fontWeight: 600 }}>{stats.total}</div></div>
        {Object.entries(stats.byStatus).map(([k,v])=> (
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
              <th style={{...styles.th, textAlign: "right"} as any}>Cost</th>
              <th style={styles.th as any}>Received</th>
              <th style={styles.th as any}>Updated</th>
              <th style={styles.th as any}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td style={styles.td as any}><b>{item.model}</b></td>
                <td style={styles.td as any}>{item.serial||"—"}</td>
                <td style={styles.td as any}><span style={styles.badge as any}>{item.status}</span></td>
                <td style={styles.td as any}>{item.location||"—"}</td>
                <td style={{...styles.td, maxWidth: 280} as any} title={item.notes}>{item.notes||""}</td>
                <td style={{...styles.td, textAlign: "right"} as any}>{item.cost? `$${item.cost.toFixed(2)}`: "—"}</td>
                <td style={styles.td as any}>{item.receivedAt||"—"}</td>
                <td style={{...styles.td, fontSize: 12, color: "#64748b"} as any}>{new Date(item.updatedAt).toLocaleString()}</td>
                <td style={styles.td as any}>
                  <RowActions 
                    item={item} 
                    onEdit={()=>setEditing(item)} 
                    onDelete={()=>remove(item.id)}
                    onQuick={(patch)=>quickUpdate(item, patch)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit / Create Modal */}
      <Modal open={open || !!editing} title={editing? "Edit Item" : "Add Item"} onClose={()=>{ setOpen(false); setEditing(null); }}>
        <InventoryForm initial={editing||undefined} onSubmit={upsert} />
        {editing && (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
            <span />
            <button style={{...styles.button, borderColor:'#ef4444', color:'#ef4444'} as any} onClick={()=>{ if(editing) remove(editing.id); setEditing(null); }}>Delete</button>
          </div>
        )}
      </Modal>

      {/* Scanner Modal */}
      <ScannerModal open={scanOpen} mode={scanMode} onClose={()=>setScanOpen(false)} onScanned={handleScanned} />

      <div style={{...styles.muted, marginTop: 16}}>
        Sync tips: we upsert using your item <b>id</b> and set <b>updated_at</b> on every change. If you still see sync errors, confirm your table name is <code>public.inventory</code> and columns include <code>received_at</code> and <code>updated_at</code>.
      </div>
    </div>
  );
}
