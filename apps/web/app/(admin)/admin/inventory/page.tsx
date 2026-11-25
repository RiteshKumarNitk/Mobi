"use client";

import { useEffect, useState } from "react";
import { api, fmt, getToken } from "@/lib/adminApi";
import { useRouter } from "next/navigation";

export default function InventoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(10);
  const [lowOnly, setLowOnly] = useState(false);
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [updates, setUpdates] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/admin/login");
  }, []);

  const load = async () => {
    try {
      const d = await api(`/admin/inventory?pageSize=100${lowOnly ? "&lowStock=true" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setRows(d.items);
      setThreshold(d.threshold);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowOnly]);

  const apply = async (productId: string, type: string, reason?: string) => {
    const quantity = Number(updates[productId]);
    if (!quantity || quantity <= 0) return;
    await api("/admin/inventory/update", {
      method: "PUT",
      body: JSON.stringify({ items: [{ productId, quantity, type, reason }] }),
    });
    setUpdates((u) => ({ ...u, [productId]: "" }));
    load();
  };

  const loadHistory = async () => {
    setHistory(await api("/admin/inventory/history"));
    setShowHistory(!showHistory);
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Inventory</h2>
        <div className="flex">
          <button className="btn sm secondary" onClick={loadHistory}>{showHistory ? "Hide History" : "Stock History"}</button>
        </div>
      </div>
      {msg && <div className="alert success">{msg}</div>}

      {showHistory && (
        <div className="panel mb-16">
          <h3>Stock Adjustment History</h3>
          <table className="table">
            <thead><tr><th>Time</th><th>Product</th><th>Type</th><th>Change</th><th>After</th><th>Reason</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="small muted">{new Date(h.createdAt).toLocaleString()}</td>
                  <td>{h.product?.name}</td>
                  <td><span className={`pill ${h.type}`}>{h.type}</span></td>
                  <td style={{ color: h.change >= 0 ? "var(--accent)" : "var(--danger)", fontWeight: 700 }}>{h.change >= 0 ? `+${h.change}` : h.change}</td>
                  <td>{h.quantityAfter}</td>
                  <td className="small muted">{h.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex mb-16">
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn sm" onClick={load}>Search</button>
        <label className="flex" style={{ alignItems: "center", marginLeft: 12 }}>
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only (≤ {threshold})
        </label>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Product</th><th>SKU</th><th>Brand</th><th>Stock</th><th>Value</th><th>Adjust</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="small muted">{p.sku}</td>
                <td>{p.brand?.name ?? "—"}</td>
                <td><span className={`pill ${p.stockStatus}`}>{p.stockQuantity} units</span></td>
                <td className="small">{fmt(p.stockValue)}</td>
                <td>
                  <div className="flex">
                    <input
                      className="input" type="number" min={0} style={{ width: 80 }} placeholder="Qty"
                      value={updates[p.id] ?? ""}
                      onChange={(e) => setUpdates({ ...updates, [p.id]: e.target.value })}
                    />
                    <button className="btn sm secondary" onClick={() => apply(p.id, "stock_in", "Manual stock-in")}>+In</button>
                    <button className="btn sm secondary" onClick={() => apply(p.id, "stock_out", "Manual stock-out")}>−Out</button>
                    <button className="btn sm secondary" onClick={() => apply(p.id, "adjustment", "Count adjustment")}>Set</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
