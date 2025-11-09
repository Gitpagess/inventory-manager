import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * ============================
 *  Inventory App (Login First)
 *  - Email/Password auth (no magic link)
 *  - Supabase sync w/ realtime (table: inventory)
 *  - Local fallback if env missing (banner shown)
 *  - Features preserved:
 *      * Add/Edit/Delete
 *      * Search & filter
 *      * CSV import/export
 *      * Scan IN/OUT (BarcodeDetector + manual fallback)
 * ============================
 */

/* =========================
   Env + Supabase bootstrap
   ========================= */
const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  (window as any).__SUPABASE_URL__ ||
  "";
const SUPABASE_ANON =
  (import.meta as any).env?.VITE_SUPABASE_ANON ||
  (window as any).__SUPABASE_ANON__ ||
  "";

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON
    ? createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: true, storageKey: "inventory-auth" },
        realtime: { params: { eventsPerSecond: 10 } },
      })
    : null;

const usingLocalOnly = !supabase;

/* ================
   Types & Helpers
   ================ */
const STATUSES = [
  "Stock",
  "Display",
  "Open Box",
  "Ordered",
  "Reserved",
  "Installed/Sold",
  "Returned",
] as const;
type Status = (typeof STATUSES)[number];

type Item = {
  id: string; // uuid
  model: string;
  serial?: string | null;
  status: Status;
  location?: string | null;
  notes?: string | null;
  cost?: number | null;
  receivedAt?: string | null; // ISO date string (yyyy-mm-dd ok)
  updatedAt: string; // ISO timestamp
};

const uuid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now();

const STORAGE_KEY = "inventory-manager-v2";

/* ========================
   CSV helpers
   ======================== */
function csvEscape(v: string | number | undefined | null) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

function downloadCSV(filename: string, rows: Item[]) {
  const header = [
    "Model",
    "Serial",
    "Status",
    "Location",
    "Notes",
    "Cost",
    "ReceivedAt",
    "UpdatedAt",
    "Id",
  ];
  const lines = [header.join(",")].concat(
    rows.map((r) =>
      [
        r.model,
        r.serial ?? "",
        r.status,
        r.location ?? "",
        r.notes ?? "",
        r.cost ?? "",
        r.receivedAt ?? "",
        r.updatedAt,
        r.id,
      ]
        .map(csvEscape)
        .join(",")
    )
  );
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): Item[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const items: Item[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const cols = row.match(/([^",]+|"(?:[^"]|"")*")+/g) || [];
    const get = (n: string) => {
      const j = idx(n);
      if (j < 0) return "";
      const raw = cols[j] || "";
      return raw.startsWith('"') && raw.endsWith('"')
        ? raw.slice(1, -1).replaceAll('""', '"')
        : raw;
    };
    const now = new Date().toISOString();
    const id = get("Id") || uuid();
    items.push({
      id,
      model: get("Model") || "UNKNOWN",
      serial: get("Serial") || null,
      status: ((get("Status") as Status) || "Stock") as Status,
      location: get("Location") || null,
      notes: get("Notes") || null,
      cost: get("Cost") ? Number(get("Cost")) : null,
      receivedAt: get("ReceivedAt") || null,
      updatedAt: get("UpdatedAt") || now,
    });
  }
  return items;
}

/* =========================
   Minimal styles (inline)
   ========================= */
const styles = {
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: 16,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial',
  },
  h1: { fontSize: 22, margin: "8px 0 4px" },
  muted: { color: "#666", fontSize: 12 },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  row: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  input: {
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
  },
  select: {
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
  },
  button: {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    borderRadius: 8,
    cursor: "pointer",
  },
  buttonPrimary: {
    padding: "8px 12px",
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "white",
    borderRadius: 8,
    cursor: "pointer",
  },
  tableWrap: {
    overflowX: "auto" as const,
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 14 },
  th: { textAlign: "left" as const, padding: 12, background: "#f8fafc", color: "#475569" },
  td: { padding: 12, borderTop: "1px solid #f1f5f9" },
  badge: { border: "1px solid #cbd5e1", borderRadius: 999, padding: "2px 8px", fontSize: 12 },
  stat: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, textAlign: "center" as const },
  banner: {
    padding: 10,
    borderRadius: 8,
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    marginBottom: 12,
  },
};

/* =========================
   Auth (email/password)
   ========================= */
function AuthGate({
  children,
}: {
  children: (args: { user: any; signOut: () => Promise<void> }) => React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!supabase) return;
    // get current session
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    // subscribe
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  if (!supabase) {
    // No Supabase configured — allow access but show banner
    return (
      <div>
        <div style={styles.banner as any}>
          Supabase is not configured. Running in <b>local-only</b> mode (no sync).<br />
          Define <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON</code> in your build (or set
          <code>window.__SUPABASE_URL__</code>/<code>window.__SUPABASE_ANON__</code>) to enable login + sync.
        </div>
        {children({ user: null, signOut: async () => {} })}
      </div>
    );
  }

  const signIn = async () => {
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErr(error.message);
    setBusy(false);
  };

  const signUp = async () => {
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) setErr(error.message);
    setBusy(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return (
      <div style={{ ...styles.card, maxWidth: 420, margin: "24px auto" } as any}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Sign in</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <div style={styles.muted as any}>Email</div>
            <input
              style={{ ...styles.input, width: "100%" } as any}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div style={styles.muted as any}>Password</div>
            <input
              type="password"
              style={{ ...styles.input, width: "100%" } as any}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {err && <div style={{ color: "#b91c1c", fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy} style={styles.buttonPrimary as any} onClick={signIn}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <button disabled={busy} style={styles.button as any} onClick={signUp}>
              Create account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children({ user, signOut })}</>;
}

/* =========================
   Scanner Modal
   ========================= */
function ScannerModal({
  open,
  mode,
  onClose,
  onScanned,
}: {
  open: boolean;
  mode: "IN" | "OUT";
  onClose: () => void;
  onScanned: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [manual, setManual] = useState<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setError("");
    setManual("");
    let cancelled = false;

    async function start() {
      try {
        const hasBarcode = typeof (globalThis as any).BarcodeDetector !== "undefined";
        setSupported(hasBarcode);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) return;
        streamRef.current = stream;
        if (videoRef.current) {
          (videoRef.current as any).srcObject = stream;
          await (videoRef.current as any).play();
        }
        if (hasBarcode) {
          const detector = new (window as any).BarcodeDetector({
            formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"],
          });
          const tick = async () => {
            try {
              if (videoRef.current) {
                const results = await detector.detect(videoRef.current);
                if (results && results.length) {
                  const payload = results[0].rawValue || results[0].cornerPoints?.toString();
                  if (payload) onScanned(String(payload));
                }
              }
            } catch {
              /* ignore frame errors */
            }
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
      const s = streamRef.current;
      streamRef.current = null;
      if (s) s.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "min(720px,95vw)", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>
            Scan to {mode === "IN" ? "ADD (IN)" : "REMOVE (OUT)"} inventory
          </div>
          <button style={styles.button as any} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {supported ? (
            <div>
              <video ref={videoRef} style={{ width: "100%", borderRadius: 12, background: "#000" }} muted playsInline />
              <div style={{ ...(styles.muted as any), marginTop: 6 }}>
                Tip: point the camera at the barcode. Supported: QR, Code128, EAN/UPC.
              </div>
            </div>
          ) : (
            <div style={styles.muted as any}>
              BarcodeDetector not supported. Use manual entry below, or open over HTTPS Chrome/Safari.
            </div>
          )}

          {!!error && <div style={{ color: "#b91c1c", fontSize: 13 }}>Camera error: {error}</div>}

          <div>
            <div style={{ marginBottom: 6 }}>Manual code (fallback)</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Scan code or type here"
                style={{ ...(styles.input as any), flex: 1 }}
              />
              <button
                style={styles.buttonPrimary as any}
                onClick={() => {
                  if (manual.trim()) onScanned(manual.trim());
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Form + Row Actions + Modal
   ========================= */
function InventoryForm({
  initial,
  onSubmit,
}: {
  initial?: Partial<Item>;
  onSubmit: (i: Item) => void;
}) {
  const [model, setModel] = useState(initial?.model || "");
  const [serial, setSerial] = useState(initial?.serial || "");
  const [status, setStatus] = useState<Status>((initial?.status as Status) || "Stock");
  const [location, setLocation] = useState(initial?.location || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [cost, setCost] = useState(initial?.cost?.toString() || "");
  const [receivedAt, setReceivedAt] = useState(initial?.receivedAt || "");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <div>Model</div>
        <input
          style={styles.input as any}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g., EX22CN"
        />
      </div>
      <div>
        <div>Serial</div>
        <input
          style={styles.input as any}
          value={serial || ""}
          onChange={(e) => setSerial(e.target.value)}
          placeholder="e.g., NB.LB-003680"
        />
      </div>
      <div>
        <div>Status</div>
        <select
          style={styles.select as any}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div>Location</div>
        <input
          style={styles.input as any}
          value={location || ""}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Shop / Showroom / 1619 Prairie"
        />
      </div>
      <div style={{ gridColumn: "1 / span 2" }}>
        <div>Notes</div>
        <textarea
          style={{ ...(styles.input as any), width: "100%", minHeight: 64 }}
          value={notes || ""}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Purchase, dates, who handled it"
        />
      </div>
      <div>
        <div>Cost (with tax)</div>
        <input
          type="number"
          style={styles.input as any}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="e.g., 2309"
        />
      </div>
      <div>
        <div>Received At</div>
        <input
          type="date"
          style={styles.input as any}
          value={receivedAt || ""}
          onChange={(e) => setReceivedAt(e.target.value)}
        />
      </div>
      <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          style={styles.buttonPrimary as any}
          onClick={() => {
            const now = new Date().toISOString();
            onSubmit({
              id: (initial?.id as string) || uuid(),
              model: model.trim() || "UNKNOWN",
              serial: serial?.toString().trim() || null,
              status,
              location: location?.toString().trim() || null,
              notes: notes?.toString().trim() || null,
              cost: cost ? Number(cost) : null,
              receivedAt: receivedAt || null,
              updatedAt: now,
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function RowActions({
  item,
  onEdit,
  onDelete,
  onQuick,
}: {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
  onQuick: (i: Partial<Item>) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button style={styles.button as any} onClick={() => onQuick({ status: "Installed/Sold" })}>
        Mark Sold
      </button>
      <button style={styles.button as any} onClick={() => onQuick({ status: "Reserved" })}>
        Reserve
      </button>
      <button
        style={styles.button as any}
        onClick={() => onQuick({ status: "Display", location: "Showroom" })}
      >
        Move to Showroom
      </button>
      <button style={styles.button as any} onClick={onEdit}>
        Edit
      </button>
      <button style={styles.button as any} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ background: "white", borderRadius: 12, padding: 16, width: "min(680px, 92vw)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <button style={styles.button as any} onClick={onClose}>
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

/* =========================
   Supabase sync helpers
   ========================= */
async function sbLoadAll(): Promise<Item[]> {
  if (!supabase) return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .order("updatedAt", { ascending: false });
  if (error) throw error;
  return (data as Item[]) || [];
}

async function sbUpsert(items: Item[] | Item) {
  if (!supabase) {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const arr = Array.isArray(items) ? items : [items];
    // merge by id
    const map = new Map<string, Item>(current.map((i: Item) => [i.id, i]));
    for (const it of arr) map.set(it.id, it);
    const merged = Array.from(map.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return { data: merged, error: null };
  }
  const payload = Array.isArray(items) ? items : [items];
  return await supabase.from("inventory").upsert(payload);
}

async function sbDelete(id: string) {
  if (!supabase) {
    const current: Item[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const next = current.filter((i) => i.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { data: null, error: null };
  }
  return await supabase.from("inventory").delete().eq("id", id);
}

/* =========================
   Main App
   ========================= */
export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locFilter, setLocFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"IN" | "OUT">("IN");
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);

  // initial load + realtime
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await sbLoadAll();
        setItems(data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();

    if (!supabase) return;
    // realtime on 'inventory'
    const channel = supabase
      .channel("inventory-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        async (_payload) => {
          try {
            const data = await sbLoadAll();
            setItems(data);
          } catch (e) {
            console.error(e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // local backup (optional)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((it) => {
      const hay = [it.model, it.serial, it.status, it.location, it.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const okQ = !t || hay.includes(t);
      const okS = statusFilter === "all" || it.status === statusFilter;
      const okL = locFilter === "all" || (it.location || "").toLowerCase().includes(locFilter.toLowerCase());
      return okQ && okS && okL;
    });
  }, [items, q, statusFilter, locFilter]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    filtered.forEach((i) => {
      byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    });
    return { byStatus, total: filtered.length };
  }, [filtered]);

  const upsertOne = async (it: Item) => {
    const now = new Date().toISOString();
    const next = { ...it, updatedAt: now };
    await sbUpsert(next);
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === next.id);
      return idx >= 0 ? [...prev.slice(0, idx), next, ...prev.slice(idx + 1)] : [next, ...prev];
    });
    setEditing(null);
    setOpen(false);
  };

  const quickUpdate = async (item: Item, patch: Partial<Item>) => {
    const now = new Date().toISOString();
    const next = { ...item, ...patch, updatedAt: now } as Item;
    await sbUpsert(next);
    setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  };

  const remove = async (id: string) => {
    await sbDelete(id);
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const doExport = () =>
    downloadCSV(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, filtered);

  const doImport = async (file: File) => {
    const text = await file.text();
    const imported = parseCSV(text);
    if (!imported.length) return;
    await sbUpsert(imported);
    // Refresh after import
    const all = await sbLoadAll();
    setItems(all);
  };

  const createFromCode = (code: string): Partial<Item> => {
    // Allow MODEL|SERIAL or just SERIAL
    let model = "";
    let serial = code.trim();
    if (code.includes("|")) {
      const [m, s] = code.split("|");
      model = (m || "").trim();
      serial = (s || "").trim();
    }
    return { model: model || "UNKNOWN", serial };
  };

  const handleScanned = async (code: string) => {
    setScanOpen(false);
    const now = new Date().toISOString();
    const exists = items.find((i) => (i.serial || "").toLowerCase() === code.toLowerCase());

    if (scanMode === "IN") {
      if (exists) {
        await quickUpdate(exists, { status: "Stock", updatedAt: now });
      } else {
        const base = createFromCode(code);
        const next: Item = {
          id: uuid(),
          model: (base.model as string) || "UNKNOWN",
          serial: (base.serial as string) || null,
          status: "Stock",
          location: null,
          notes: null,
          cost: null,
          receivedAt: null,
          updatedAt: now,
        };
        await sbUpsert(next);
        setItems((prev) => [next, ...prev]);
      }
    } else {
      if (exists) {
        await quickUpdate(exists, { status: "Installed/Sold", updatedAt: now });
      } else {
        const base = createFromCode(code);
        const next: Item = {
          id: uuid(),
          model: (base.model as string) || "UNKNOWN",
          serial: (base.serial as string) || null,
          status: "Installed/Sold",
          location: null,
          notes: "Scanned OUT (placeholder)",
          cost: null,
          receivedAt: null,
          updatedAt: now,
        };
        await sbUpsert(next);
        setItems((prev) => [next, ...prev]);
      }
    }
  };

  return (
    <AuthGate>
      {({ user, signOut }) => (
        <div style={styles.container as any}>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={styles.h1 as any}>4Seasons / Gaslight — Inventory Manager</div>
              <div style={styles.muted as any}>
                {usingLocalOnly
                  ? "Local mode (no sync)"
                  : `Signed in${user ? ` as ${user.email || user.id}` : ""} — synced via Supabase`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!usingLocalOnly && user && (
                <button style={styles.button as any} onClick={signOut}>
                  Sign out
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div style={styles.card as any}>Loading inventory…</div>
          ) : (
            <>
              {/* Controls */}
              <div style={styles.card as any}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Search & Filters</div>
                <div style={{ ...(styles.row as any), alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div>Search</div>
                    <input
                      placeholder="Model / Serial / Notes / Location"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      style={{ ...(styles.input as any), width: "100%" }}
                    />
                  </div>
                  <div>
                    <div>Status</div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      style={styles.select as any}
                    >
                      <option value="all">All</option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div>Location contains</div>
                    <input
                      placeholder="Shop / Showroom / 1619 Prairie"
                      value={locFilter === "all" ? "" : locFilter}
                      onChange={(e) => setLocFilter(e.target.value || "all")}
                      style={styles.input as any}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ ...(styles.row as any), marginBottom: 12 }}>
                <button style={styles.buttonPrimary as any} onClick={() => setOpen(true)}>
                  + New Item
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) doImport(f);
                    (e.currentTarget as any).value = "";
                  }}
                />
                <button style={styles.button as any} onClick={() => fileRef.current?.click()}>
                  Import CSV
                </button>
                <button style={styles.button as any} onClick={doExport}>
                  Export CSV (filtered)
                </button>
                <span style={{ flex: 1 }} />
                <button
                  style={styles.button as any}
                  onClick={() => {
                    setScanMode("IN");
                    setScanOpen(true);
                  }}
                >
                  📷 Scan IN
                </button>
                <button
                  style={styles.button as any}
                  onClick={() => {
                    setScanMode("OUT");
                    setScanOpen(true);
                  }}
                >
                  📷 Scan OUT
                </button>
              </div>

              {/* Stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div style={styles.stat as any}>
                  <div style={styles.muted as any}>Total</div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{stats.total}</div>
                </div>
                {Object.entries(stats.byStatus).map(([k, v]) => (
                  <div key={k} style={styles.stat as any}>
                    <div style={styles.muted as any}>{k}</div>
                    <div style={{ fontSize: 22, fontWeight: 600 }}>{v}</div>
                  </div>
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
                      <th style={{ ...(styles.th as any), textAlign: "right" }}>Cost</th>
                      <th style={styles.th as any}>Received</th>
                      <th style={styles.th as any}>Updated</th>
                      <th style={styles.th as any}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.id}>
                        <td style={styles.td as any}>
                          <b>{item.model}</b>
                        </td>
                        <td style={styles.td as any}>{item.serial || "—"}</td>
                        <td style={styles.td as any}>
                          <span style={styles.badge as any}>{item.status}</span>
                        </td>
                        <td style={styles.td as any}>{item.location || "—"}</td>
                        <td style={{ ...(styles.td as any), maxWidth: 280 }} title={item.notes || ""}>
                          {item.notes || ""}
                        </td>
                        <td style={{ ...(styles.td as any), textAlign: "right" }}>
                          {item.cost ? `$${Number(item.cost).toFixed(2)}` : "—"}
                        </td>
                        <td style={styles.td as any}>{item.receivedAt || "—"}</td>
                        <td style={{ ...(styles.td as any), fontSize: 12, color: "#64748b" }}>
                          {new Date(item.updatedAt).toLocaleString()}
                        </td>
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

              {/* Modals */}
              <Modal
                open={open || !!editing}
                title={editing ? "Edit Item" : "New Item"}
                onClose={() => {
                  setOpen(false);
                  setEditing(null);
                }}
              >
                <InventoryForm initial={editing || undefined} onSubmit={upsertOne} />
                {editing && (
                  <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
                    <span />
                    <button
                      style={{ ...(styles.button as any), borderColor: "#ef4444", color: "#ef4444" }}
                      onClick={() => {
                        if (editing) remove(editing.id);
                        setEditing(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </Modal>

              <ScannerModal
                open={scanOpen}
                mode={scanMode}
                onClose={() => setScanOpen(false)}
                onScanned={handleScanned}
              />

              {/* Tips */}
              <div style={{ ...(styles.muted as any), marginTop: 16 }}>
                💡 Scan rules: supports <code>MODEL|SERIAL</code> or just <code>SERIAL</code>.{" "}
                <b>Scan IN</b> creates or sets to Stock; <b>Scan OUT</b> sets to Installed/Sold (or creates a
                placeholder).
              </div>
            </>
          )}
        </div>
      )}
    </AuthGate>
  );
}
