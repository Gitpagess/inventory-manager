import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";

// =============== Supabase Client (frontend-safe) ===============
const SUPABASE_URL = "https://bkhkgxgmlhvjidoximyx.supabase.co";        // <-- put yours
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraGtneGdtbGh2amlkb3hpbXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1ODU2NjYsImV4cCI6MjA3ODE2MTY2Nn0.56GAQbU5vFYtBZwz8vFYTj8tttzEdKcwvQRjd8yz8WI"; 
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// =====================================================
// ZERO-DEPENDENCY INVENTORY APP — with Auth + Barcode Scan IN/OUT
// - Requires: @supabase/supabase-js (frontend package)
// - CSV import/export, localStorage persistence, quick actions
// - Camera barcode scanner (BarcodeDetector if available) with manual fallback
// - Auth: Email + Password; gates UI until signed-in
// =====================================================

// ---- Types ----
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

type Item = {
  id: string; // uuid
  model: string;
  serial?: string;
  status: Status;
  location?: string; // Shop, 1619 Prairie, Showroom, etc.
  notes?: string;
  cost?: number; // our cost with tax
  receivedAt?: string; // ISO date
  updatedAt: string; // ISO date
};

// uuid fallback for older environments
const uuid = () =>
  (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

const seedData: Item[] = [
  { id: uuid(), model: "EX11CN", status: "Stock", location: "—", notes: "Sylvia", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "EX11CN", status: "Stock", location: "—", notes: "Sylvia", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "EX11CN", status: "Stock", location: "—", notes: "Sylvia", updatedAt: new Date().toISOString() },

  { id: uuid(), model: "EX17CN", status: "Open Box", location: "take back from 1614 Allison", notes: "Sylvia", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "EX17CN", status: "Display", location: "Showroom Display", notes: "Showroom", updatedAt: new Date().toISOString() },

  { id: uuid(), model: "EX22CN", serial: "NB.LB-003680", status: "Stock", location: "—", notes: "Sylvia", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "EX22CN", serial: "NB.LB-003006", status: "Stock", location: "Shop — 1619 Prairie (10-7533)", notes: "Aug 25", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "EX22CN", serial: "24397", status: "Stock", location: "Shop", notes: "July 23 — new stock at shop, finally sale", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "EX22CN", serial: "NB.LB-003008", status: "Stock", location: "Shop", notes: "July 23 — new stock at shop, finally sale", updatedAt: new Date().toISOString() },

  { id: uuid(), model: "AR9T960603BN", serial: "2505267633", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "AR9T960603BN", serial: "2505272372", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "AR9T960603BN", serial: "2505272374", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax", updatedAt: new Date().toISOString() },

  { id: uuid(), model: "AMVM970803BN", serial: "2411115464", status: "Stock", location: "Shop", notes: "10-10", updatedAt: new Date().toISOString() },
  { id: uuid(), model: "AMVM970803BN", serial: "2411115465", status: "Stock", location: "Shop", notes: "10-10", updatedAt: new Date().toISOString() },
];

// ---- Utilities ----
const STORAGE_KEY = "inventory-manager-v1";
const load = (): Item[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData;
    const parsed = JSON.parse(raw) as Item[];
    return parsed?.length ? parsed : seedData;
  } catch {
    return seedData;
  }
};
const save = (items: Item[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

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
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
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
    const get = (n: string) => {
      const j = idx(n); if (j<0) return "";
      const raw = cols[j] || "";
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1,-1).replaceAll('""','"') : raw;
    };
    const now = new Date().toISOString();
    items.push({
      id: uuid(),
      model: get("Model") || get("model") || 'UNKNOWN',
      serial: get("Serial") || undefined,
      status: (get("Status") as Status) || "Stock",
      location: get("Location") || undefined,
      notes: get("Notes") || undefined,
      cost: get("Cost") ? Number(get("Cost")) : undefined,
      receivedAt: get("ReceivedAt") || undefined,
      updatedAt: get("UpdatedAt") || now,
    });
  }
  return items;
}

// ---- Tiny UI helpers (no external CSS)
const styles = {
  container: { maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Arial" },
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

// ---- Auth UI (email + password)
function AuthGate({ onReady }: { onReady: (session: Session) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
      if (data.session) onReady(data.session);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) onReady(s);
    });
    return () => { sub.subscription.unsubscribe(); mounted = false; };
  }, [onReady]);

  const signIn = async () => {
    try {
      setErr(""); setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
      if (error) setErr(error.message);
      else setShowForm(false);
    } finally { setLoading(false); }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Top bar always visible (Sign in / user + Sign out)
  return (
    <div style={{ ...styles.container, paddingTop: 8 }}>
      <div style={{ ...styles.row, justifyContent: "space-between", marginBottom: 8 }}>
        <div style={styles.h1 as any}>4Seasons / Gaslight — Inventory Manager</div>
        <div>
          {!session ? (
            <button style={styles.buttonPrimary as any} onClick={() => setShowForm(true)}>Sign in</button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={styles.muted as any}>{session.user.email}</span>
              <button style={styles.button as any} onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>

      {/* Sign-in modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, width: "min(460px, 92vw)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Sign in</div>
              <button style={styles.button as any} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div>Email</div>
                <input type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} style={{...styles.input, width: "100%"} as any} />
              </div>
              <div>
                <div>Password</div>
                <input type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} style={{...styles.input, width: "100%"} as any} />
              </div>
              {!!err && <div style={{ color: "#b91c1c", fontSize: 13 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={styles.button as any} onClick={()=>setShowForm(false)}>Cancel</button>
                <button disabled={loading} style={styles.buttonPrimary as any} onClick={signIn}>{loading ? "Signing in..." : "Sign in"}</button>
              </div>
              <div style={styles.muted as any}>
                Tip: Create users in **Supabase → Auth → Users**. Email+password works best for Pages.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gate: block children until signed-in */}
      {!session ? (
        <div style={{ ...styles.card }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>Authentication required</div>
          <div style={styles.muted as any}>
            Click <b>Sign in</b> (top-right) to access inventory.
          </div>
        </div>
      ) : (
        <InventoryAppBody />
      )}
    </div>
  );
}

// ---- Inventory Form + Components (unchanged logic)
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
          const now = new Date().toISOString();
          onSubmit({
            id: initial?.id || uuid(),
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

// ---- Barcode Scanner (native API with graceful fallback)
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

    async function start(){
      try{
        const hasBarcode = typeof (globalThis as any).BarcodeDetector !== 'undefined';
        setSupported(hasBarcode);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if(cancelled) return;
        streamRef.current = stream;
        if(videoRef.current){
          (videoRef.current as any).srcObject = stream;
          await (videoRef.current as any).play();
        }
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
            }catch(e){ }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        }
      }catch(e:any){
        setError(e?.message || 'Camera access failed');
      }
    }
    start();

    return () => {
      cancelled = true;
      if(rafRef.current) cancelAnimationFrame(rafRef.current);
      const s = streamRef.current; streamRef.current = null;
      if(s){ s.getTracks().forEach(t=>t.stop()); }
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
              <div style={{...styles.muted, marginTop:6}}>Tip: point the camera at the barcode. Supported formats: QR, Code128, EAN/UPC.</div>
            </div>
          ) : (
            <div style={{...styles.muted}}>BarcodeDetector not supported in this browser. Use manual entry below or access via HTTPS/Chrome.</div>
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

// ---- Helpers: in/out operations
function createFromCode(code: string): Partial<Item>{
  // Heuristic: allow MODEL|SERIAL or just SERIAL
  let model = '';
  let serial = code.trim();
  if(code.includes('|')){
    const [m,s] = code.split('|');
    model = (m||'').trim();
    serial = (s||'').trim();
  }
  return { model: model || 'UNKNOWN', serial };
}

// ---- Minimal tests
(function runTests(){
  try {
    console.assert(csvEscape('a,b') === '"a,b"', 'csvEscape should quote commas');
    console.assert(csvEscape('a\n b') === '"a\n b"', 'csvEscape should quote newlines');
    const parsed1 = parseCSV('Model,Serial,Status\nEX22CN,NB1,Stock');
    console.assert(parsed1.length === 1 && parsed1[0].model === 'EX22CN' && parsed1[0].serial === 'NB1', 'parseCSV basic');
    const parsed2 = parseCSV('Model,Serial\r\nEX22CN,NB2');
    console.assert(parsed2.length === 1 && parsed2[0].serial === 'NB2', 'parseCSV CRLF');
  } catch(e){ /* ignore in prod */ }
})();

// ================= Inventory Body (requires session) =================
function InventoryAppBody(){
  const [items, setItems] = useState<Item[]>(load());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locFilter, setLocFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'IN'|'OUT'>('IN');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{ save(items); },[items]);

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
    const byModel: Record<string, number> = {};
    filtered.forEach(i=>{
      byStatus[i.status] = (byStatus[i.status]||0)+1;
      byModel[i.model] = (byModel[i.model]||0)+1;
    });
    return { byStatus, byModel, total: filtered.length };
  },[filtered]);

  const upsert = (it: Item) => {
    setItems(prev => {
      const idx = prev.findIndex(p => p.id === it.id);
      const next = idx >= 0 ? [...prev.slice(0,idx), it, ...prev.slice(idx+1)] : [it, ...prev];
      return next;
    });
    setEditing(null); setOpen(false);
  };

  const quickUpdate = (item: Item, patch: Partial<Item>) => {
    setItems(prev => prev.map(p => p.id===item.id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p));
  };

  const remove = (id: string) => setItems(prev => prev.filter(p => p.id!==id));

  const doExport = () => downloadCSV(`inventory-${new Date().toISOString().slice(0,10)}.csv`, filtered);

  const doImport = async (file: File) => {
    const text = await file.text();
    const imported = parseCSV(text);
    if (!imported.length) return;
    setItems(prev => [...imported, ...prev]);
  };

  const handleScanned = (code: string) => {
    setScanOpen(false);
    const now = new Date().toISOString();
    if(scanMode === 'IN'){
      const exists = items.find(i => (i.serial||'').toLowerCase() === code.toLowerCase());
      if(exists){
        setItems(prev => prev.map(p => p.id===exists.id ? { ...p, status:'Stock', updatedAt: now } : p));
      } else {
        const base = createFromCode(code);
        setItems(prev => [{ id: uuid(), model: base.model||'UNKNOWN', serial: base.serial, status:'Stock', updatedAt: now }, ...prev]);
      }
    }else{
      const exists = items.find(i => (i.serial||'').toLowerCase() === code.toLowerCase());
      if(exists){
        setItems(prev => prev.map(p => p.id===exists.id ? { ...p, status:'Installed/Sold', updatedAt: now } : p));
      } else {
        const base = createFromCode(code);
        setItems(prev => [{ id: uuid(), model: base.model||'UNKNOWN', serial: base.serial, status:'Installed/Sold', notes:'Scanned OUT (placeholder)', updatedAt: now }, ...prev]);
      }
    }
  };

  return (
    <>
      {/* Controls */}
      <div style={styles.card as any}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>搜索与筛选</div>
        <div style={{...styles.row, alignItems: "flex-end"}}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div>搜索</div>
            <input placeholder="Model / Serial / 备注 / 地点" value={q} onChange={e=>setQ(e.target.value)} style={{...styles.input, width: "100%"} as any} />
          </div>
          <div>
            <div>状态</div>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={styles.select as any}>
              <option value="all">All</option>
              {STATUSES.map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div>地点筛选</div>
            <input placeholder="Shop / Showroom / 1619 Prairie" value={locFilter === "all" ? "" : locFilter} onChange={e=> setLocFilter(e.target.value || "all")} style={styles.input as any} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{...styles.row, marginBottom: 12}}>
        <button style={styles.buttonPrimary as any} onClick={()=>setOpen(true)}>+ 新增物料</button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e)=>{ const f=e.target.files?.[0]; if(f) doImport(f); (e.currentTarget as any).value = ""; }} />
        <button style={styles.button as any} onClick={()=>fileRef.current?.click()}>导入 CSV</button>
        <button style={styles.button as any} onClick={doExport}>导出 CSV（当前筛选）</button>
        <span style={{ flex:1 }} />
        <button style={styles.button as any} onClick={()=>{ setScanMode('IN'); setScanOpen(true); }}>📷 Scan IN</button>
        <button style={styles.button as any} onClick={()=>{ setScanMode('OUT'); setScanOpen(true); }}>📷 Scan OUT</button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <div style={styles.stat as any}><div style={styles.muted as any}>合计</div><div style={{ fontSize: 22, fontWeight: 600 }}>{stats.total}</div></div>
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
      <Modal open={open || !!editing} title={editing? "编辑物料" : "新增物料"} onClose={()=>{ setOpen(false); setEditing(null); }}>
        <InventoryForm initial={editing||undefined} onSubmit={upsert} />
        {editing && (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
            <span />
            <button style={{...styles.button, borderColor:'#ef4444', color:'#ef4444'} as any} onClick={()=>{ if(editing) remove(editing.id); setEditing(null); }}>删除</button>
          </div>
        )}
      </Modal>

      {/* Scanner Modal */}
      <ScannerModal open={scanOpen} mode={scanMode} onClose={()=>setScanOpen(false)} onScanned={handleScanned} />

      {/* Helper tips */}
      <div style={{...styles.muted, marginTop: 16}}>
        💡 扫描规则：支持 <code>MODEL|SERIAL</code> 或仅 <code>SERIAL</code>。Scan IN 没找到会新建并设为 Stock；Scan OUT 没找到会建一个“已出库(占位)”记录，便于对账。
        <br/>🔒 摄像头权限：需 HTTPS 或本机来源；不支持的浏览器可使用手动输入。
      </div>
    </>
  );
}

// Root export: render AuthGate which shows Inventory after sign-in
export default function App(){
  const onReady = (_session: Session) => {
    // hook for future: load/sync items from Supabase if desired
  };
  return <AuthGate onReady={onReady} />;
}
