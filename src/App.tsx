import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";

/** ============================
 *  CONFIG — replace these 2
 *  ============================ */
const SUPABASE_URL = "https://bkhkgxgmlhvjidoximyx.supabase.co";       // <-- REPLACE
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraGtneGdtbGh2amlkb3hpbXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1ODU2NjYsImV4cCI6MjA3ODE2MTY2Nn0.56GAQbU5vFYtBZwz8vFYTj8tttzEdKcwvQRjd8yz8WI";             // <-- REPLACE

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Data types mapped to snake_case table columns */
type Item = {
  id: string;
  model: string;
  serial: string | null;
  status: string;
  location: string | null;
  notes: string | null;
  cost: number | null;
  received_at: string | null; // YYYY-MM-DD
  updated_at: string;         // ISO
};

const STATUSES = ["Stock","Display","Open Box","Ordered","Reserved","Installed/Sold","Returned"] as const;

const styles = {
  wrap: { maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  card: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const },
  input: { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8 },
  select: { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8 },
  button: { padding: "8px 12px", border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 8, cursor: "pointer" },
  primary: { padding: "8px 12px", border: "1px solid #2563eb", background: "#2563eb", color: "white", borderRadius: 8, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 14 },
  th: { textAlign: "left" as const, padding: 12, background: "#f8fafc", color: "#475569" },
  td: { padding: 12, borderTop: "1px solid #f1f5f9" },
};

function Login({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string>("");

  const signIn = async () => {
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setErr(error.message); return; }
    onAuthed();
  };

  return (
    <div style={{...styles.wrap, display:"grid", placeItems:"center", minHeight:"60vh"}}>
      <div style={{...styles.card, width: 380}}>
        <h2 style={{marginTop:0}}>Sign in</h2>
        <div style={{marginBottom:8}}>
          <div>Email</div>
          <input style={{...styles.input, width:"100%"}} value={email} onChange={e=>setEmail(e.target.value)} />
        </div>
        <div style={{marginBottom:12}}>
          <div>Password</div>
          <input type="password" style={{...styles.input, width:"100%"}} value={pw} onChange={e=>setPw(e.target.value)} />
        </div>
        {err && <div style={{color:"#b91c1c", marginBottom:8}}>{err}</div>}
        <button style={styles.primary as any} onClick={signIn}>Sign in</button>
        <div style={{fontSize:12, color:"#64748b", marginTop:8}}>No sign-up available. Ask admin to create your user.</div>
      </div>
    </div>
  );
}

function Editor({ initial, onSave, onCancel }: {
  initial?: Partial<Item>,
  onSave: (i: Partial<Item>) => void,
  onCancel: () => void
}) {
  const [model, setModel] = useState(initial?.model || "");
  const [serial, setSerial] = useState(initial?.serial || "");
  const [status, setStatus] = useState<string>(initial?.status || "Stock");
  const [location, setLocation] = useState(initial?.location || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [cost, setCost] = useState(initial?.cost?.toString() || "");
  const [received, setReceived] = useState(initial?.received_at || "");

  return (
    <div style={{...styles.card}}>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        <div><div>Model</div><input style={{...styles.input, width:"100%"}} value={model} onChange={e=>setModel(e.target.value)} /></div>
        <div><div>Serial</div><input style={{...styles.input, width:"100%"}} value={serial||""} onChange={e=>setSerial(e.target.value)} /></div>
        <div>
          <div>Status</div>
          <select style={{...styles.select, width:"100%"}} value={status} onChange={e=>setStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><div>Location</div><input style={{...styles.input, width:"100%"}} value={location||""} onChange={e=>setLocation(e.target.value)} /></div>
        <div style={{gridColumn:"1 / span 2"}}>
          <div>Notes</div>
          <textarea style={{...styles.input, width:"100%", minHeight:64}} value={notes||""} onChange={e=>setNotes(e.target.value)} />
        </div>
        <div><div>Cost</div><input type="number" style={{...styles.input, width:"100%"}} value={cost} onChange={e=>setCost(e.target.value)} /></div>
        <div><div>Received At</div><input type="date" style={{...styles.input, width:"100%"}} value={received||""} onChange={e=>setReceived(e.target.value)} /></div>
      </div>
      <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:12}}>
        <button style={styles.button as any} onClick={onCancel}>Cancel</button>
        <button style={styles.primary as any} onClick={()=> onSave({
          model: model.trim(),
          serial: serial?.trim() || null,
          status,
          location: location?.trim() || null,
          notes: notes?.trim() || null,
          cost: cost ? Number(cost) : null,
          received_at: received || null,
          updated_at: new Date().toISOString(),
          id: initial?.id as string | undefined,
        })}>Save</button>
      </div>
    </div>
  );
}

export default function App(){
  const [sessionReady, setSessionReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string>("");

  // auth bootstrap
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // fetch + realtime
  useEffect(() => {
    if (!authed) return;
    (async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) { setErr(error.message); return; }
      setItems(data as Item[]);
    })();

    // realtime
    const ch: RealtimeChannel = supabase
      .channel("realtime:inventory")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        payload => {
          const row = payload.new as Item || payload.old as Item;
          setItems(prev => {
            if (payload.eventType === "INSERT") return [payload.new as Item, ...prev];
            if (payload.eventType === "UPDATE") return prev.map(x => x.id === row.id ? (payload.new as Item) : x);
            if (payload.eventType === "DELETE") return prev.filter(x => x.id !== row.id);
            return prev;
          });
        })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [authed]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(it => ([
      it.model, it.serial, it.status, it.location, it.notes
    ].filter(Boolean).join(" ").toLowerCase().includes(t)));
  }, [items, q]);

  const saveItem = async (patch: Partial<Item>) => {
    setErr("");
    if (patch.id) {
      const { error } = await supabase.from("inventory").update(patch).eq("id", patch.id);
      if (error) setErr(error.message);
    } else {
      const { error } = await supabase.from("inventory").insert([patch]);
      if (error) setErr(error.message);
    }
    setCreating(false);
    setEditing(null);
  };

  const deleteItem = async (id: string) => {
    setErr("");
    const { error } = await supabase.from("inventory").delete().eq("id", id);
    if (error) setErr(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (!sessionReady) return null;

  if (!authed) return <Login onAuthed={()=>setAuthed(true)} />;

  return (
    <div style={styles.wrap as any}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
        <h2 style={{margin:0}}>Inventory</h2>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <input placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} style={styles.input as any} />
          <button style={styles.button as any} onClick={()=>setCreating(true)}>+ New</button>
          <button style={styles.button as any} onClick={signOut}>Sign out</button>
        </div>
      </div>

      {err && <div style={{...styles.card, color:"#b91c1c"}}>Error: {err}</div>}

      {creating && (
        <Editor onSave={saveItem} onCancel={()=>setCreating(false)} />
      )}
      {editing && (
        <Editor initial={editing} onSave={saveItem} onCancel={()=>setEditing(null)} />
      )}

      <div style={{border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden"}}>
        <table style={styles.table as any}>
          <thead>
            <tr>
              <th style={styles.th as any}>Model</th>
              <th style={styles.th as any}>Serial</th>
              <th style={styles.th as any}>Status</th>
              <th style={styles.th as any}>Location</th>
              <th style={styles.th as any}>Notes</th>
              <th style={{...styles.th, textAlign:"right"} as any}>Cost</th>
              <th style={styles.th as any}>Received</th>
              <th style={styles.th as any}>Updated</th>
              <th style={styles.th as any}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(it => (
              <tr key={it.id}>
                <td style={styles.td as any}><b>{it.model}</b></td>
                <td style={styles.td as any}>{it.serial || "—"}</td>
                <td style={styles.td as any}>{it.status}</td>
                <td style={styles.td as any}>{it.location || "—"}</td>
                <td style={{...styles.td, maxWidth: 280} as any} title={it.notes || ""}>{it.notes || ""}</td>
                <td style={{...styles.td, textAlign:"right"} as any}>{it.cost == null ? "—" : `$${Number(it.cost).toFixed(2)}`}</td>
                <td style={styles.td as any}>{it.received_at || "—"}</td>
                <td style={{...styles.td, fontSize:12, color:"#64748b"} as any}>{new Date(it.updated_at).toLocaleString()}</td>
                <td style={styles.td as any}>
                  <div style={{display:"flex", gap:6}}>
                    <button style={styles.button as any} onClick={()=>setEditing(it)}>Edit</button>
                    <button style={styles.button as any} onClick={()=>deleteItem(it.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td style={{padding:24, color:"#64748b"}} colSpan={9}>No items</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
