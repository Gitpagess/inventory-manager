// App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

// ✅ STEP 3: PASTE YOUR KEYS HERE
const SUPABASE_URL = "https://bkhkgxgmlhvjidoximyx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraGtneGdtbGh2amlkb3hpbXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1ODU2NjYsImV4cCI6MjA3ODE2MTY2Nn0.56GAQbU5vFYtBZwz8vFYTj8tttzEdKcwvQRjd8yz8WI";

// Import Supabase client via ESM CDN (no npm needed)
import { createClient, RealtimeChannel } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------- Types ----------------
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
  id: string;
  model: string;
  serial?: string | null;
  status: Status;
  location?: string | null;
  notes?: string | null;
  cost?: number | null;
  received_at?: string | null;  // date (YYYY-MM-DD)
  updated_at: string;           // ISO timestamp
  created_at?: string;          // ISO timestamp
};

// ------------- Local cache helpers -------------
const STORAGE_KEY = "inventory-manager-cache-v2";
const loadCache = (): Item[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Item[]) : [];
  } catch {
    return [];
  }
};
const saveCache = (rows: Item[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {}
};

// CSV helpers
function csvEscape(v: any) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
function downloadCSV(filename: string, rows: Item[]) {
  const header = ["Model","Serial","Status","Location","Notes","Cost","ReceivedAt","UpdatedAt"];
  const lines = [header.join(",")].concat(
    rows.map(r => [
      r.model, r.serial ?? "", r.status, r.location ?? "", r.notes ?? "",
      r.cost ?? "", r.received_at ?? "", r.updated_at
    ].map(csvEscape).join(","))
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function parseCSV(text: string): Item[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].split(",").map(s => s.trim().toLowerCase());
  const at = (k: string) => header.indexOf(k.toLowerCase());
  const out: Item[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const cols = row.match(/([^",]+|"(?:[^"]|"")*")+/g) || [];
    const get = (name: string) => {
      const j = at(name); if (j < 0) return "";
      const raw = cols[j] || "";
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1).replaceAll('""','"') : raw;
    };
    const now = new Date().toISOString();
    out.push({
      id: crypto.randomUUID(),
      model: get("Model") || get("model") || "UNKNOWN",
      serial: get("Serial") || null,
      status: (get("Status") as Status) || "Stock",
      location: get("Location") || null,
      notes: get("Notes") || null,
      cost: get("Cost") ? Number(get("Cost")) : null,
      received_at: get("ReceivedAt") || null,
      updated_at: get("UpdatedAt") || now,
      created_at: now,
    });
  }
  return out;
}

// ---------------- Supabase data ops ----------------
async function fetchAll(): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Item[];
}

async function upsertItem(row: Partial<Item> & { id?: string }) {
  const payload: any = { ...row };
  if (!payload.id) payload.id = crypto.randomUUID();
  payload.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("items").upsert(payload).select().single();
  if (error) throw error;
  return data as Item;
}

async function deleteItem(id: string) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

// --------------- UI styles (plain CSS-in-JS) ---------------
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

// --------------- Components ---------------
function InventoryForm({ initial, onSubmit }: { initial?: Partial<Item>, onSubmit: (i: Item) => void }) {
  const [model, setModel] = useState(initial?.model || "");
  const [serial, setSerial] = useState(initial?.serial || "");
  const [status, setStatus] = useState<Status>((initial?.status as Status) || "Stock");
  const [location, setLocation] = useState(initial?.location || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [cost, setCost] = useState(initial?.cost?.toString() || "");
  const [receivedAt, setReceivedAt] = useState(initial?.received_at || "");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <div>Model</div>
        <input style={styles.input as any} value={model} onChange={e => setModel(e.target.value)} placeholder="e.g., EX22CN" />
      </div>
      <div>
        <div>Serial</div>
        <input style={styles.input as any} value={serial ?? ""} onChange={e => setSerial(e.target.value)} placeholder="e.g., NB.LB-003680" />
      </div>
      <div>
        <div>Status</div>
        <select style={styles.select as any} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <div>Location</div>
        <input style={styles.input as any} value={location ?? ""} onChange={e => setLocation(e.target.value)} placeholder="Shop / Showroom / 1619 Prairie" />
      </div>
      <div style={{ gridColumn: "1 / span 2" }}>
        <div>Notes</div>
        <textarea style={{ ...styles.input, width: "100%", minHeight: 64 } as any} value={notes ?? ""} onChange={e => setNotes(e.target.value)} placeholder="Notes (e.g., Sylvia, Aug 25)" />
      </div>
      <div>
        <div>Cost (with tax)</div>
        <input type="number" style={styles.input as any} value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g., 2309" />
      </div>
      <div>
        <div>Received At</div>
        <input type="date" style={styles.input as any} value={receivedAt ?? ""} onChange={e => setReceivedAt(e.target.value)} />
      </div>
      <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          style={styles.buttonPrimary as any}
          onClick={() => {
            const now = new Date().toISOString();
            onSubmit({
              id: (initial as Item)?.id || crypto.randomUUID(),
              model: model.trim() || "UNKNOWN",
              serial: (serial || "").trim() || null,
              status,
              location: (location || "").trim() || null,
              notes: (notes || "").trim() || null,
              cost: cost ? Number(cost) : null,
              received_at: receivedAt || null,
              updated_at: now,
              created_at: (initial as Item)?.created_at || now
            } as Item);
          }}
        >Save</button>
      </div>
    </div>
  );
}

function RowActions({ item, onEdit, onDelete, onQuick }: { item: Item, onEdit: () => void, onDelete: () => void, onQuick: (i: Partial<Item>) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button style={styles.button as any} onClick={() => onQuick({ status: "Installed/Sold" })}>Mark Sold</button>
      <button style={styles.button as any} onClick={() => onQuick({ status: "Reserved" })}>Reserve</button>
      <button style={styles.button as any} onClick={() => onQuick({ status: "Display", location: "Showroom" })}>Move to Showroom</button>
      <button style={styles.button as any} onClick={onEdit}>Edit</button>
      <button style={styles.button as any} onClick={onDelete}>Delete</button>
    </div>
  );
}

function Modal({ open, title, onClose, children }: { open: boolean, title: string, onClose: () => void, children: React.ReactNode }) {
  if (!open) return null;
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

// ---- Barcode Scanner (native API with fallback) ----
function ScannerModal({ open, mode, onClose, onScanned }: { open: boolean, mode: 'IN' | 'OUT', onClose: () => void, onScanned: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [manual, setManual] = useState<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setError(""); setManual("");
    let cancelled = false;

    async function start() {
      try {
        const hasBarcode = typeof (globalThis as any).BarcodeDetector !== "undefined";
        setSupported(hasBarcode);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) return;
        streamRef.current = stream;
        if (videoRef.current) {
          (videoRef.current as any).srcObject = stream;
          await (videoRef.current as any).play();
        }
        if (hasBarcode) {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code","code_128","ean_13","ean_8","upc_a","upc_e"] });
          const tick = async () => {
            try {
              if (videoRef.current) {
                const results = await detector.detect(videoRef.current);
                if (results && results.length) {
                  const payload = results[0].rawValue || results[0].cornerPoints?.toString();
                  if (payload) { onScanned(String(payload)); }
                }
              }
            } catch {}
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        }
      } catch (e: any) {
        setError(e?.message || "Camera access failed");
      }
    }
    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const s = streamRef.current; streamRef.current = null;
      if (s) { s.getTracks().forEach(t => t.stop()); }
    };
  }, [open]);

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 'min(720px,95vw)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Scan to {mode === 'IN' ? 'ADD (IN)' : 'REMOVE (OUT)'} inventory</div>
          <button style={styles.button as any} onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {supported ? (
            <div>
              <video ref={videoRef} style={{ width: '100%', borderRadius: 12, background: '#000' }} muted playsInline />
              <div style={{ ...styles.muted, marginTop: 6 }}>Tip: Supported formats include Code128, EAN/UPC, QR.</div>
            </div>
          ) : (
            <div style={{ ...styles.muted }}>BarcodeDetector not supported. Use manual entry or open in Chrome/Safari over HTTPS.</div>
          )}
          {!!error && <div style={{ color: '#b91c1c', fontSize: 13 }}>Camera error: {error}</div>}
          <div>
            <div style={{ marginBottom: 6 }}>Manual code (fallback)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={manual} onChange={e => setManual(e.target.value)} placeholder="Scan code or type here" style={{ ...styles.input, flex: 1 } as any} />
              <button style={styles.buttonPrimary as any} onClick={() => { if (manual.trim()) onScanned(manual.trim()); }}>Submit</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Helpers for scanning ----
function findBySerial(items: Item[], serial: string) {
  return items.find(i => (i.serial || "").toLowerCase() === serial.toLowerCase());
}
function createFromCode(code: string): Partial<Item> {
  let model = "";
  let serial = code.trim();
  if (code.includes("|")) {
    const [m, s] = code.split("|");
    model = (m || "").trim();
    serial = (s || "").trim();
  }
  return { model: model || "UNKNOWN", serial };
}

// --------------- Main App ---------------
export default function App() {
  const [items, setItems] = useState<Item[]>(loadCache());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locFilter, setLocFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'IN' | 'OUT'>('IN');

  // First load from Supabase
  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchAll();
        setItems(rows);
        saveCache(rows);
      } catch {
        // stay on cached data
      }
    })();
  }, []);

  // Realtime changes
  useEffect(() => {
    const ch: RealtimeChannel = supabase
      .channel("items-rt")
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (payload: any) => {
        setItems(prev => {
          let next = prev.slice();
          if (payload.eventType === "INSERT") {
            next = [payload.new as Item, ...next.filter(x => x.id !== payload.new.id)];
          } else if (payload.eventType === "UPDATE") {
            next = next.map(x => x.id === payload.new.id ? (payload.new as Item) : x);
          } else if (payload.eventType === "DELETE") {
            next = next.filter(x => x.id !== payload.old.id);
          }
          saveCache(next);
          return next;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter(it => {
      const hay = [it.model, it.serial, it.status, it.location, it.notes].filter(Boolean).join(" ").toLowerCase();
      const okQ = !t || hay.includes(t);
      const okS = statusFilter === "all" || it.status === statusFilter;
      const okL = locFilter === "all" || (it.location || "").toLowerCase().includes(locFilter.toLowerCase());
      return okQ && okS && okL;
    });
  }, [items, q, statusFilter, locFilter]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    filtered.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });
    return { byStatus, total: filtered.length };
  }, [filtered]);

  const upsert = async (it: Item) => {
    const saved = await upsertItem(it);
    setItems(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      const next = idx >= 0 ? [...prev.slice(0, idx), saved, ...prev.slice(idx + 1)] : [saved, ...prev];
      saveCache(next);
      return next;
    });
    setEditing(null); setOpen(false);
  };

  const quickUpdate = async (item: Item, patch: Partial<Item>) => {
    await upsert({ ...item, ...patch });
  };

  const remove = async (id: string) => {
    await deleteItem(id);
    setItems(prev => {
      const next = prev.filter(p => p.id !== id);
      saveCache(next);
      return next;
    });
  };

  const doExport = () => downloadCSV(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, filtered);
  const doImport = async (file: File) => {
    const text = await file.text();
    const imported = parseCSV(text);
    if (!imported.length) return;
    // upsert one by one (simple); we can batch later
    for (const row of imported) { await upsertItem(row); }
    const rows = await fetchAll();
    setItems(rows); saveCache(rows);
  };

  const handleScanned = async (code: string) => {
    setScanOpen(false);
    const now = new Date().toISOString();
    const existing = findBySerial(items, code);
    if (scanMode === "IN") {
      if (existing) {
        await upsert({ ...existing, status: "Stock", updated_at: now });
      } else {
        const base = createFromCode(code);
        await upsert({
          id: crypto.randomUUID(),
          model: (base.model as string) || "UNKNOWN",
          serial: base.serial as string,
          status: "Stock",
          updated_at: now,
        } as Item);
      }
    } else {
      if (existing) {
        await upsert({ ...existing, status: "Installed/Sold", updated_at: now });
      } else {
        const base = createFromCode(code);
        await upsert({
          id: crypto.randomUUID(),
          model: (base.model as string) || "UNKNOWN",
          serial: base.serial as string,
          status: "Installed/Sold",
          notes: "Scanned OUT (placeholder)",
          updated_at: now,
        } as Item);
      }
    }
  };

  // file input ref (CSV import)
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={styles.container as any}>
      <div style={{ marginBottom: 12 }}>
        <div style={styles.h1 as any}>4Seasons / Gaslight — Inventory Manager (Supabase Sync)</div>
        <div style={styles.muted as any}>Real-time sync across devices. Data stored in Supabase (free). Local cache in browser for offline.</div>
      </div>

      <div style={styles.card as any}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Search & Filters</div>
        <div style={{ ...styles.row, alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div>Search</div>
            <input placeholder="Model / Serial / Notes / Location" value={q} onChange={e => setQ(e.target.value)} style={{ ...styles.input, width: "100%" } as any} />
          </div>
          <div>
            <div>Status</div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={styles.select as any}>
              <option value="all">All</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div>Location filter</div>
            <input placeholder="Shop / Showroom / 1619 Prairie" value={locFilter === "all" ? "" : locFilter} onChange={e => setLocFilter(e.target.value || "all")} style={styles.input as any} />
          </div>
        </div>
      </div>

      <div style={{ ...styles.row, marginBottom: 12 }}>
        <button style={styles.buttonPrimary as any} onClick={() => setOpen(true)}>+ New Item</button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); (e.currentTarget as any).value = ""; }} />
        <button style={styles.button as any} onClick={() => fileRef.current?.click()}>Import CSV</button>
        <button style={styles.button as any} onClick={doExport}>Export CSV (filtered)</button>
        <span style={{ flex: 1 }} />
        <button style={styles.button as any} onClick={() => { setScanMode('IN'); setScanOpen(true); }}>📷 Scan IN</button>
        <button style={styles.button as any} onClick={() => { setScanMode('OUT'); setScanOpen(true); }}>📷 Scan OUT</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <div style={styles.stat as any}><div style={styles.muted as any}>Total</div><div style={{ fontSize: 22, fontWeight: 600 }}>{stats.total}</div></div>
        {Object.entries(stats.byStatus).map(([k, v]) => (
          <div key={k} style={styles.stat as any}><div style={styles.muted as any}>{k}</div><div style={{ fontSize: 22, fontWeight: 600 }}>{v}</div></div>
        ))}
      </div>

      <div style={styles.tableWrap as any}>
        <table style={styles.table as any}>
          <thead>
            <tr>
              <th style={styles.th as any}>Model</th>
              <th style={styles.th as any}>Serial</th>
              <th style={styles.th as any}>Status</th>
              <th style={styles.th as any}>Location</th>
              <th style={styles.th as any}>Notes</th>
              <th style={{ ...styles.th, textAlign: "right" } as any}>Cost</th>
              <th style={styles.th as any}>Received</th>
              <th style={styles.th as any}>Updated</th>
              <th style={styles.th as any}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td style={styles.td as any}><b>{item.model}</b></td>
                <td style={styles.td as any}>{item.serial || "—"}</td>
                <td style={styles.td as any}><span style={styles.badge as any}>{item.status}</span></td>
                <td style={styles.td as any}>{item.location || "—"}</td>
                <td style={{ ...styles.td, maxWidth: 280 } as any} title={item.notes ?? ""}>{item.notes || ""}</td>
                <td style={{ ...styles.td, textAlign: "right" } as any}>{item.cost != null ? `$${Number(item.cost).toFixed(2)}` : "—"}</td>
                <td style={styles.td as any}>{item.received_at || "—"}</td>
                <td style={{ ...styles.td, fontSize: 12, color: "#64748b" } as any}>{new Date(item.updated_at).toLocaleString()}</td>
                <td style={styles.td as any}>
                  <RowActions
                    item={item}
                    onEdit={() => setEditing(item)}
                    onDelete={() => remove(item.id)}
                    onQuick={(patch) => quickUpdate(item, patch)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open || !!editing} title={editing ? "Edit Item" : "New Item"} onClose={() => { setOpen(false); setEditing(null); }}>
        <InventoryForm
          initial={editing || undefined}
          onSubmit={upsert}
        />
        {editing && (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
            <span />
            <button style={{ ...styles.button, borderColor: '#ef4444', color: '#ef4444' } as any} onClick={() => { if (editing) remove(editing.id); setEditing(null); }}>Delete</button>
          </div>
        )}
      </Modal>

      <ScannerModal open={scanOpen} mode={scanMode} onClose={() => setScanOpen(false)} onScanned={handleScanned} />

      <div style={{ ...styles.muted, marginTop: 16 }}>
        💡 Scan rules: use <code>MODEL|SERIAL</code> or just <code>SERIAL</code>. IN creates/sets Stock; OUT sets Installed/Sold (or creates placeholder).<br/>
        🔒 Camera needs HTTPS. With Supabase sync, all devices see the same data instantly.
      </div>
    </div>
  );
}
