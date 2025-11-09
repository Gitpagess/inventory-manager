import React, { useEffect, useMemo, useRef, useState } from "react";

// Inventory statuses
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
  serial?: string;
  status: Status;
  location?: string;
  notes?: string;
  cost?: number;
  receivedAt?: string;
  updatedAt: string;
};

// ID generator
const uuid = () =>
  (crypto?.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now());

// Initial data (your HVAC stock)
const seedData: Item[] = (() => {
  const now = new Date().toISOString();
  const mk = (x: Partial<Item>): Item =>
    ({ updatedAt: now, id: uuid(), status: "Stock", model: "UNKNOWN", ...x });

  return [
    mk({ model: "EX11CN", notes: "Sylvia" }),
    mk({ model: "EX11CN", notes: "Sylvia" }),
    mk({ model: "EX11CN", notes: "Sylvia" }),

    mk({ model: "EX17CN", status: "Open Box", location: "take back from 1614 Allison", notes: "Sylvia" }),
    mk({ model: "EX17CN", status: "Display", location: "Showroom Display", notes: "Showroom" }),

    mk({ model: "EX22CN", serial: "NB.LB-003680", notes: "Sylvia" }),
    mk({ model: "EX22CN", serial: "NB.LB-003006", location: "Shop – 1619 Prairie (10-7533)", notes: "Aug 25" }),
    mk({ model: "EX22CN", serial: "24397", location: "Shop", notes: "July 23 – new stock at shop, finally sale" }),
    mk({ model: "EX22CN", serial: "NB.LB-003008", location: "Shop", notes: "July 23 – new stock at shop, finally sale" }),

    mk({ model: "AR9T960603BN", serial: "2505267633", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax" }),
    mk({ model: "AR9T960603BN", serial: "2505272372", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax" }),
    mk({ model: "AR9T960603BN", serial: "2505272374", status: "Ordered", location: "4 Seasons", notes: "JULY 2025 — our cost $2309 with tax" }),

    mk({ model: "AMVM970803BN", serial: "2411115464", location: "Shop", notes: "10-10" }),
    mk({ model: "AMVM970803BN", serial: "2411115465", location: "Shop", notes: "10-10" }),
  ];
})();

// LocalStorage persistence
const STORAGE_KEY = "inventory-manager-v1";
const load = (): Item[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : seedData;
  } catch {
    return seedData;
  }
};
const save = (items: Item[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

// CSV helpers
function csvEscape(v: any) {
  if (v == null) return "";
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
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.model,
        r.serial ?? "",
        r.status,
        r.location ?? "",
        r.notes ?? "",
        r.cost ?? "",
        r.receivedAt ?? "",
        r.updatedAt,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function parseCSV(text: string): Item[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const header = lines[0].split(",").map((x) => x.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());

  const out: Item[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols =
      lines[i].match(/([^",]+|"(?:[^"]|"")*")+/g) ?? [];

    const get = (name: string) => {
      const j = idx(name);
      if (j < 0) return "";
      const raw = cols[j] || "";
      return raw.startsWith('"') && raw.endsWith('"')
        ? raw.slice(1, -1).replaceAll('""', '"')
        : raw;
    };

    out.push({
      id: uuid(),
      model: get("model") || "UNKNOWN",
      serial: get("serial") || undefined,
      status: (get("status") as Status) || "Stock",
      location: get("location") || undefined,
      notes: get("notes") || undefined,
      cost: get("cost") ? Number(get("cost")) : undefined,
      receivedAt: get("receivedat") || undefined,
      updatedAt: get("updatedat") || new Date().toISOString(),
    });
  }
  return out;
}

// Styles (inline for GitHub Pages)
const s: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    padding: 12,
    border: "1px solid #ddd",
    borderRadius: 10,
    marginBottom: 12,
    background: "#fff",
  },
  row: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  input: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #ccc",
  },
  btn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "#f4f4f4",
    cursor: "pointer",
  },
  btnP: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
  },
};

// Modal
function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: any;
}) {
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
        zIndex: 99,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 16,
          width: "min(680px, 90vw)",
        }}
      >
        <div style={{ ...s.row, justifyContent: "space-between" }}>
          <b>{title}</b>
          <button style={s.btn} onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Camera scanner modal
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
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError("");

    (async () => {
      try {
        const has = typeof (window as any).BarcodeDetector !== "undefined";
        setSupported(has);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (has) {
          const detector = new (window as any).BarcodeDetector({
            formats: ["qr_code", "code_128", "upc_a", "ean_13"],
          });

          const tick = async () => {
            try {
              if (videoRef.current) {
                const found = await detector.detect(videoRef.current);
                if (found?.length) {
                  onScanned(found[0].rawValue || "");
                  return;
                }
              }
            } catch {}
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      } catch (e: any) {
        setError(e?.message || "Camera blocked");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={`Scan to ${mode === "IN" ? "ADD" : "REMOVE"}`}
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 12 }}>
        {supported ? (
          <video
            ref={videoRef}
            style={{
              width: "100%",
              borderRadius: 8,
              background: "#000",
            }}
            muted
            playsInline
          />
        ) : (
          <div style={{ color: "#666" }}>
            BarcodeDetector not supported; use manual entry.
          </div>
        )}

        {error && <div style={{ color: "red" }}>{error}</div>}

        <div style={s.row}>
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="Manual code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button
            style={s.btnP}
            onClick={() => manual.trim() && onScanned(manual.trim())}
          >
            Submit
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Quick code parser "MODEL|SERIAL" or "SERIAL"
function createFromCode(code: string) {
  const parts = code.split("|");
  if (parts.length === 2) {
    return { model: parts[0], serial: parts[1] };
  }
  return { model: "UNKNOWN", serial: code };
}

// Inventory UI
export default function App() {
  const [items, setItems] = useState<Item[]>(load());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locFilter, setLocFilter] = useState("all");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"IN" | "OUT">("IN");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => save(items), [items]);

  // Filtering
  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return items.filter((i) => {
      const hay = [i.model, i.serial, i.status, i.location, i.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!t || hay.includes(t)) &&
        (statusFilter === "all" || i.status === statusFilter) &&
        (locFilter === "all" ||
          (i.location ?? "").toLowerCase().includes(locFilter.toLowerCase()))
      );
    });
  }, [items, q, statusFilter, locFilter]);

  // Stats
  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    filtered.forEach((i) => (byStatus[i.status] = (byStatus[i.status] || 0) + 1));
    return { total: filtered.length, byStatus };
  }, [filtered]);

  // Save or update item
  const upsert = (item: Item) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        return [...prev.slice(0, idx), item, ...prev.slice(idx + 1)];
      }
      return [item, ...prev];
    });
    setOpenForm(false);
    setEditing(null);
  };

  // Handle scanning logic
  const handleScanned = (code: string) => {
    setScanOpen(false);

    const now = new Date().toISOString();
    const match =
      items.find((i) => i.serial?.toLowerCase() === code.toLowerCase()) || null;

    if (scanMode === "IN") {
      if (match) {
        // Just update status to Stock
        setItems((prev) =>
          prev.map((p) =>
            p.id === match.id ? { ...p, status: "Stock", updatedAt: now } : p
          )
        );
      } else {
        // Add new item
        const base = createFromCode(code);
        setItems((prev) => [
          {
            id: uuid(),
            model: base.model,
            serial: base.serial,
            status: "Stock",
            updatedAt: now,
          },
          ...prev,
        ]);
      }
    } else {
      // OUT (sold/removed)
      if (match) {
        setItems((prev) =>
          prev.map((p) =>
            p.id === match.id
              ? { ...p, status: "Installed/Sold", updatedAt: now }
              : p
          )
        );
      } else {
        const base = createFromCode(code);
        setItems((prev) => [
          {
            id: uuid(),
            model: base.model,
            serial: base.serial,
            status: "Installed/Sold",
            notes: "Scanned OUT (placeholder)",
            updatedAt: now,
          },
          ...prev,
        ]);
      }
    }
  };

  // Delete item
  const remove = (id: string) =>
    setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div style={s.wrap}>
      <h2>4Seasons / Gaslight — Inventory Manager</h2>

      {/* Search */}
      <div style={s.card}>
        <div style={{ fontWeight: 600 }}>Search & Filters</div>
        <div style={{ ...s.row, marginTop: 8 }}>
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="Model / Serial / Notes / Location"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            style={s.input}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            {STATUSES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>

          <input
            style={s.input}
            placeholder="Location filter"
            value={locFilter === "all" ? "" : locFilter}
            onChange={(e) => setLocFilter(e.target.value || "all")}
          />
        </div>
      </div>

      {/* Buttons */}
      <div style={{ ...s.row, marginBottom: 12 }}>
        <button style={s.btnP} onClick={() => setOpenForm(true)}>
          + Add Item
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              f.text().then((txt) => {
                const imported = parseCSV(txt);
                if (imported.length)
                  setItems((prev) => [...imported, ...prev]);
              });
            e.target.value = "";
          }}
        />

        <button style={s.btn} onClick={() => fileRef.current?.click()}>
          Import CSV
        </button>

        <button
          style={s.btn}
          onClick={() => downloadCSV("inventory.csv", filtered)}
        >
          Export CSV
        </button>

        <span style={{ flex: 1 }} />

        <button
          style={s.btn}
          onClick={() => {
            setScanMode("IN");
            setScanOpen(true);
          }}
        >
          📷 Scan IN
        </button>

        <button
          style={s.btn}
          onClick={() => {
            setScanMode("OUT");
            setScanOpen(true);
          }}
        >
          📷 Scan OUT
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ ...s.card, flex: "0 0 120px", textAlign: "center" }}>
          <div>Total</div>
          <b>{stats.total}</b>
        </div>
        {Object.entries(stats.byStatus).map(([k, v]) => (
          <div
            key={k}
            style={{ ...s.card, flex: "0 0 140px", textAlign: "center" }}
          >
            <div>{k}</div>
            <b>{v}</b>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "Model",
                "Serial",
                "Status",
                "Location",
                "Notes",
                "Cost",
                "Received",
                "Updated",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: 8,
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td style={{ padding: 8 }}>{i.model}</td>
                <td style={{ padding: 8 }}>{i.serial ?? "—"}</td>
                <td style={{ padding: 8 }}>{i.status}</td>
                <td style={{ padding: 8 }}>{i.location ?? "—"}</td>
                <td style={{ padding: 8, maxWidth: 240 }}>{i.notes}</td>
                <td style={{ padding: 8 }}>{i.cost ? `$${i.cost}` : "—"}</td>
                <td style={{ padding: 8 }}>{i.receivedAt ?? "—"}</td>
                <td style={{ padding: 8, fontSize: 12 }}>
                  {new Date(i.updatedAt).toLocaleString()}
                </td>
                <td style={{ padding: 8 }}>
                  <button
                    style={s.btn}
                    onClick={() => setEditing(i)}
                  >
                    Edit
                  </button>
                  <button
                    style={{ ...s.btn, marginLeft: 6 }}
                    onClick={() => remove(i.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Item Form */}
      <Modal
        open={openForm || !!editing}
        title={editing ? "Edit Item" : "New Item"}
        onClose={() => {
          setOpenForm(false);
          setEditing(null);
        }}
      >
        <ItemForm
          initial={editing ?? undefined}
          onSubmit={upsert}
        />
      </Modal>

      {/* Scanner */}
      <ScannerModal
        open={scanOpen}
        mode={scanMode}
        onClose={() => setScanOpen(false)}
        onScanned={handleScanned}
      />
    </div>
  );
}

// Item editor form
function ItemForm({
  initial,
  onSubmit,
}: {
  initial?: Item;
  onSubmit: (i: Item) => void;
}) {
  const [model, setModel] = useState(initial?.model ?? "");
  const [serial, setSerial] = useState(initial?.serial ?? "");
  const [status, setStatus] = useState<Status>(initial?.status ?? "Stock");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [cost, setCost] = useState(initial?.cost?.toString() ?? "");
  const [receivedAt, setReceivedAt] = useState(initial?.receivedAt ?? "");

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <div>
        <div>Model</div>
        <input
          style={s.input}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>

      <div>
        <div>Serial</div>
        <input
          style={s.input}
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
        />
      </div>

      <div>
        <div>Status</div>
        <select
          style={s.input}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          {STATUSES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>

      <div>
        <div>Location</div>
        <input
          style={s.input}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div>
        <div>Notes</div>
        <textarea
          style={{ ...s.input, minHeight: 60 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <div>Cost</div>
        <input
          type="number"
          style={s.input}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </div>

      <div>
        <div>Received At</div>
        <input
          type="date"
          style={s.input}
          value={receivedAt}
          onChange={(e) => setReceivedAt(e.target.value)}
        />
      </div>

      <button
        style={s.btnP}
        onClick={() => {
          onSubmit({
            id: initial?.id ?? uuid(),
            model: model.trim() || "UNKNOWN",
            serial: serial.trim() || undefined,
            status,
            location: location.trim() || undefined,
            notes: notes.trim() || undefined,
            cost: cost ? Number(cost) : undefined,
            receivedAt: receivedAt || undefined,
            updatedAt: new Date().toISOString(),
          });
        }}
      >
        Save
      </button>
    </div>
  );
}
